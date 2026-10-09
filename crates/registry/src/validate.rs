use std::collections::BTreeSet;

use crate::manifest::{App, Manifest};

pub const RESERVED_KEYS: [&str; 3] = ["gateway", "pass", "pawl"];
pub const RESERVED_LABELS: [&str; 3] = ["paw", "pass", "www"];
pub const RESERVED_PORTS: [u16; 4] = [8786, 8787, 3000, 3001];
pub const RESERVED_PATHS: [&str; 8] = [
    "/api/estate",
    "/api/session",
    "/api/logout",
    "/api/auth/",
    "/oauth/",
    "/.well-known/",
    "/health",
    "/assets/",
];

fn chars_in(value: &str, allowed: impl Fn(char) -> bool) -> bool {
    value.chars().all(allowed)
}

fn lower_alnum(c: char) -> bool {
    c.is_ascii_lowercase() || c.is_ascii_digit()
}

fn is_key(value: &str) -> bool {
    (2..=16).contains(&value.len())
        && value.starts_with(|c: char| c.is_ascii_lowercase())
        && chars_in(value, lower_alnum)
}

fn is_label(value: &str) -> bool {
    (1..=12).contains(&value.len()) && chars_in(value, |c| lower_alnum(c) || c == '-')
}

fn is_printable(value: &str, max: usize) -> bool {
    let count = value.chars().count();
    count > 0 && count <= max && !value.chars().any(char::is_control) && value.trim() == value
}

fn is_subdomain(value: &str) -> bool {
    (1..=31).contains(&value.len())
        && value.starts_with(|c: char| c.is_ascii_lowercase())
        && !value.ends_with('-')
        && chars_in(value, |c| lower_alnum(c) || c == '-')
}

fn is_slug(value: &str) -> bool {
    (1..=32).contains(&value.len()) && chars_in(value, |c| lower_alnum(c) || c == '-')
}

fn is_path_prefix(value: &str) -> bool {
    value.len() >= 3
        && value.starts_with('/')
        && value.ends_with('/')
        && !value.contains("//")
        && !value.contains("..")
        && chars_in(value, |c| {
            lower_alnum(c) || matches!(c, '/' | '_' | '.' | '-')
        })
}

fn is_file_prefix(value: &str) -> bool {
    (2..=4).contains(&value.len())
        && value.ends_with('_')
        && chars_in(&value[..value.len() - 1], lower_alnum)
}

fn overlaps(a: &str, b: &str) -> bool {
    a.starts_with(b) || b.starts_with(a)
}

fn check_app(app: &App, problems: &mut Vec<String>) {
    let name = &app.key;
    if !is_key(&app.key) {
        problems.push(format!(
            "app {name}: key must be 2-16 of a-z0-9 starting with a letter"
        ));
    }
    if RESERVED_KEYS.contains(&app.key.as_str()) {
        problems.push(format!("app {name}: key {name} belongs to Pawl"));
    }
    if !is_label(&app.label) {
        problems.push(format!("app {name}: label must be 1-12 of a-z0-9-"));
    }
    if !is_printable(&app.title, 32) {
        problems.push(format!(
            "app {name}: title must be 1-32 printable characters"
        ));
    }
    if let Some(subdomain) = &app.subdomain {
        if !is_subdomain(subdomain) {
            problems.push(format!(
                "app {name}: subdomain {subdomain} is not a host label"
            ));
        }
        if RESERVED_LABELS.contains(&subdomain.as_str()) {
            problems.push(format!("app {name}: subdomain {subdomain} belongs to Pawl"));
        }
    }
    let routed = app.subdomain.is_some()
        || !app.proxy.is_empty()
        || app.apex.is_some()
        || app.estate
        || app.purge;
    if routed && app.service.as_deref().is_none_or(str::is_empty) {
        problems.push(format!("app {name}: a routed app needs a service"));
    }
    for prefix in &app.proxy {
        if !is_path_prefix(prefix) {
            problems.push(format!(
                "app {name}: proxy {prefix} must start and end with /"
            ));
        }
        if RESERVED_PATHS.iter().any(|owned| overlaps(prefix, owned)) {
            problems.push(format!(
                "app {name}: proxy {prefix} collides with a path Pawl owns"
            ));
        }
    }
    if let Some(apex) = &app.apex {
        if !is_path_prefix(&apex.resolve) {
            problems.push(format!(
                "app {name}: apex resolve must start and end with /"
            ));
        }
        if let Some(prefix) = &apex.file_slug_prefix {
            if !is_file_prefix(prefix) {
                problems.push(format!(
                    "app {name}: apex fileSlugPrefix {prefix} must look like n_"
                ));
            }
        }
    }
    if app.header.is_some() && !app.estate {
        problems.push(format!("app {name}: a header count needs estate"));
    }
    if let Some(header) = &app.header {
        if !is_printable(&header.noun, 24) {
            problems.push(format!(
                "app {name}: header noun must be 1-24 printable characters"
            ));
        }
    }
    if (app.header.is_some() || app.bay.is_some() || app.access.is_some())
        && app.subdomain.is_none()
    {
        problems.push(format!(
            "app {name}: a header, bay or access entry needs a subdomain to link to"
        ));
    }
    if let Some(bay) = &app.bay {
        let pin_ok = bay.len() == 1 && ('1'..='9').contains(&bay.chars().next().unwrap_or('0'));
        if !pin_ok {
            problems.push(format!("app {name}: bay pin must be 1-9"));
        }
    }
    if let Some(local) = &app.local {
        for port in [local.port, local.vite_port].into_iter().flatten() {
            if RESERVED_PORTS.contains(&port) {
                problems.push(format!("app {name}: local port {port} belongs to Pawl"));
            }
        }
    }
}

fn duplicates<'a>(values: impl Iterator<Item = &'a str>) -> Vec<&'a str> {
    let mut seen = BTreeSet::new();
    let mut repeated = BTreeSet::new();
    for value in values {
        if !seen.insert(value) {
            repeated.insert(value);
        }
    }
    repeated.into_iter().collect()
}

pub fn validate(manifest: &Manifest) -> Result<(), Vec<String>> {
    let mut problems = Vec::new();
    if !is_printable(&manifest.site.name, 32) {
        problems.push("site name must be 1-32 printable characters".to_owned());
    }
    for slug in &manifest.site.reserved_slugs {
        if !is_slug(slug) {
            problems.push(format!("site reservedSlugs: {slug} is not a slug"));
        }
    }
    for app in &manifest.apps {
        check_app(app, &mut problems);
    }
    for key in duplicates(manifest.apps.iter().map(|app| app.key.as_str())) {
        problems.push(format!("key {key} is used by more than one app"));
    }
    for subdomain in duplicates(
        manifest
            .apps
            .iter()
            .filter_map(|app| app.subdomain.as_deref()),
    ) {
        problems.push(format!(
            "subdomain {subdomain} is used by more than one app"
        ));
    }
    for code in duplicates(manifest.apps.iter().filter_map(|app| app.bay.as_deref())) {
        problems.push(format!("bay {code} is pinned to more than one app"));
    }
    if manifest
        .apps
        .iter()
        .filter(|app| app.subdomain.is_some())
        .count()
        > 9
    {
        problems
            .push("the cabinet has nine bays; at most nine apps may have a subdomain".to_owned());
    }
    let ports: Vec<String> = manifest
        .apps
        .iter()
        .filter_map(|app| app.local.as_ref())
        .flat_map(|local| [local.port, local.vite_port])
        .flatten()
        .map(|port| port.to_string())
        .collect();
    for port in duplicates(ports.iter().map(String::as_str)) {
        problems.push(format!("local port {port} is used by more than one app"));
    }
    if manifest
        .apps
        .iter()
        .filter(|app| app.apex.is_some())
        .count()
        > 1
    {
        problems.push("only one app may resolve apex slugs".to_owned());
    }
    let prefixes: Vec<(&str, &str)> = manifest
        .apps
        .iter()
        .flat_map(|app| {
            app.proxy
                .iter()
                .map(move |prefix| (app.key.as_str(), prefix.as_str()))
        })
        .collect();
    for (index, (key, prefix)) in prefixes.iter().enumerate() {
        for (other_key, other) in prefixes.iter().skip(index + 1) {
            if overlaps(prefix, other) {
                problems.push(format!(
                    "overlapping proxy {prefix} ({key}) and {other} ({other_key})"
                ));
            }
        }
    }
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems)
    }
}

#[cfg(test)]
mod tests {
    use crate::parse;

    fn manifest(apps: &str) -> String {
        format!(r#"{{ "site": {{ "name": "Example" }}, "apps": [{apps}] }}"#)
    }

    const NOTES: &str = r#"{
        "key": "notes", "label": "notes", "title": "Notes",
        "subdomain": "notes", "service": "notes",
        "proxy": ["/api/notes/"],
        "apex": { "resolve": "/internal/resolve/", "fileSlugPrefix": "n_" },
        "estate": true, "purge": true,
        "header": { "noun": "notes" },
        "access": "visitor",
        "local": { "port": 8790 }
    }"#;

    const DOCS: &str = r#"{
        "key": "docs", "label": "manual", "title": "Docs",
        "subdomain": "docs", "service": "docs",
        "local": { "port": 8791 }
    }"#;

    fn errors(json: &str) -> String {
        parse(json)
            .expect_err("expected the manifest to be refused")
            .join("\n")
    }

    #[test]
    fn accepts_a_well_formed_manifest() {
        assert!(parse(&manifest(&format!("{NOTES},{DOCS}"))).is_ok());
    }

    #[test]
    fn accepts_a_manifest_with_no_apps() {
        assert!(parse(r#"{ "site": { "name": "Pawl" } }"#).is_ok());
    }

    #[test]
    fn refuses_a_misspelt_field_by_name() {
        let json = manifest(&NOTES.replace("\"estate\"", "\"estates\""));
        assert!(errors(&json).contains("estates"));
    }

    #[test]
    fn refuses_a_key_pawl_owns() {
        let json = manifest(&NOTES.replace("\"key\": \"notes\"", "\"key\": \"pass\""));
        assert!(errors(&json).contains("key"));
    }

    #[test]
    fn refuses_two_apps_with_one_key() {
        let twin = DOCS.replace("\"key\": \"docs\"", "\"key\": \"notes\"");
        assert!(errors(&manifest(&format!("{NOTES},{twin}"))).contains("notes"));
    }

    #[test]
    fn refuses_a_subdomain_pawl_owns() {
        let json = manifest(&DOCS.replace("\"subdomain\": \"docs\"", "\"subdomain\": \"paw\""));
        assert!(errors(&json).contains("subdomain"));
    }

    #[test]
    fn refuses_a_proxy_under_a_path_pawl_owns() {
        let json = manifest(&NOTES.replace("/api/notes/", "/oauth/notes/"));
        assert!(errors(&json).contains("/oauth/notes/"));
    }

    #[test]
    fn refuses_a_proxy_that_would_swallow_a_path_pawl_owns() {
        let json = manifest(&NOTES.replace("/api/notes/", "/api/"));
        assert!(errors(&json).contains("/api/"));
    }

    #[test]
    fn refuses_overlapping_proxies_across_apps() {
        let docs = DOCS.replace(
            "\"service\": \"docs\"",
            "\"service\": \"docs\", \"proxy\": [\"/api/notes/extra/\"]",
        );
        assert!(errors(&manifest(&format!("{NOTES},{docs}"))).contains("overlapping proxy"));
    }

    #[test]
    fn refuses_a_second_apex_app() {
        let docs = DOCS.replace(
            "\"service\": \"docs\"",
            "\"service\": \"docs\", \"apex\": { \"resolve\": \"/r/\" }",
        );
        assert!(errors(&manifest(&format!("{NOTES},{docs}"))).contains("apex"));
    }

    #[test]
    fn refuses_a_routed_app_without_a_service() {
        let json = manifest(&DOCS.replace("\"service\": \"docs\",", ""));
        assert!(errors(&json).contains("service"));
    }

    #[test]
    fn refuses_a_header_without_estate() {
        let json = manifest(&NOTES.replace("\"estate\": true", "\"estate\": false"));
        assert!(errors(&json).contains("header"));
    }

    #[test]
    fn refuses_two_apps_pinned_to_one_bay() {
        let notes = NOTES.replace("\"access\"", "\"bay\": \"4\", \"access\"");
        let docs = DOCS.replace("\"local\"", "\"bay\": \"4\", \"local\"");
        assert!(errors(&manifest(&format!("{notes},{docs}"))).contains("bay 4"));
    }

    #[test]
    fn refuses_a_pin_outside_the_cabinet() {
        let docs = DOCS.replace("\"local\"", "\"bay\": \"10\", \"local\"");
        assert!(errors(&manifest(&docs)).contains("bay"));
    }

    #[test]
    fn refuses_a_tenth_app_the_cabinet_has_no_bay_for() {
        let apps: Vec<String> = (0..10)
            .map(|index| {
                format!(r#"{{ "key": "app{index}", "label": "a{index}", "title": "App {index}", "subdomain": "app{index}", "service": "app{index}" }}"#)
            })
            .collect();
        assert!(errors(&manifest(&apps.join(","))).contains("nine"));
    }

    #[test]
    fn refuses_a_port_pawl_uses() {
        let json = manifest(&DOCS.replace("8791", "8787"));
        assert!(errors(&json).contains("8787"));
    }

    #[test]
    fn lists_every_problem_at_once() {
        let json = manifest(
            &DOCS
                .replace("\"key\": \"docs\"", "\"key\": \"Docs\"")
                .replace("\"subdomain\": \"docs\"", "\"subdomain\": \"www\""),
        );
        let problems = parse(&json).expect_err("refused");
        assert!(problems.len() >= 2, "{problems:?}");
    }
}
