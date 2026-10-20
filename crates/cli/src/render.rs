use std::fs;
use std::path::Path;

use registry::Registry;
use serde_json::{Value, json};

pub const WORKER: &str = "pawl";
pub const CLIENT_ID: &str = "gateway";
pub const EMPTY_MANIFEST: &str = r#"{"site":{"name":"Pawl"}}"#;
const PROVIDER_LABEL: &str = "paw";

fn label(value: &str) -> bool {
    (1..=63).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && !value.starts_with('-')
        && !value.ends_with('-')
}

pub fn domain(value: &str) -> Result<String, String> {
    let domain = value.trim().to_ascii_lowercase();
    let domain = domain.strip_suffix('.').unwrap_or(&domain);
    let labels: Vec<&str> = domain.split('.').collect();
    let tld = labels.last().copied().unwrap_or_default();
    if domain.len() > 253
        || labels.len() < 2
        || !labels.iter().all(|part| label(part))
        || !(2..=63).contains(&tld.len())
        || !tld.bytes().all(|byte| byte.is_ascii_lowercase())
    {
        return Err(format!(
            "ROOT_DOMAIN must be a bare hostname such as example.com, not {value:?}."
        ));
    }
    Ok(domain.to_owned())
}

pub fn sender(root: &str) -> String {
    format!("Pawl <no-reply@{root}>")
}

pub fn issuer(root: &str) -> String {
    format!("https://{PROVIDER_LABEL}.{root}")
}

pub fn compatibility_date(root: &Path) -> Result<String, String> {
    let file = root.join("worker/wrangler.jsonc");
    let config =
        fs::read_to_string(&file).map_err(|error| format!("{}: {error}", file.display()))?;
    let start = config
        .find("\"compatibility_date\"")
        .ok_or("worker/wrangler.jsonc names no compatibility_date")?;
    config[start..]
        .split('"')
        .nth(3)
        .map(str::to_owned)
        .ok_or_else(|| "worker/wrangler.jsonc has an unreadable compatibility_date".to_owned())
}

fn registry(manifest: &str) -> Result<Registry, String> {
    let manifest = if manifest.trim().is_empty() {
        EMPTY_MANIFEST
    } else {
        manifest
    };
    Registry::new(manifest)
        .map_err(|problems| format!("The manifest is invalid:\n  {}", problems.join("\n  ")))
}

fn services(registry: &Registry, name: impl Fn(&str) -> String) -> Value {
    Value::Array(
        registry
            .bindings()
            .into_iter()
            .map(|binding| json!({ "binding": binding.binding, "service": name(&binding.service) }))
            .collect(),
    )
}

fn rate_limits(local: bool) -> Value {
    let limit = |production: u32| if local { 1000 } else { production };
    Value::Array(
        [
            ("AUTHORIZE_RATE_LIMIT", "3401", 30),
            ("TOKEN_RATE_LIMIT", "3402", 60),
            ("SIGNIN_RATE_LIMIT", "3403", 10),
            ("SIGNIN_TRY_LIMIT", "3404", 30),
            ("SIGNIN_FAILURE_LIMIT", "3405", 10),
        ]
        .into_iter()
        .map(|(name, namespace, production)| {
            json!({ "name": name, "namespace_id": namespace, "simple": { "limit": limit(production), "period": 60 } })
        })
        .collect(),
    )
}

pub struct Production<'a> {
    pub account_id: &'a str,
    pub root_domain: &'a str,
    pub manifest: &'a str,
    pub d1_id: &'a str,
    pub kv_id: &'a str,
    pub compatibility_date: &'a str,
}

pub fn production(input: &Production) -> Result<Value, String> {
    let root = domain(input.root_domain)?;
    let registry = registry(input.manifest)?;
    let routes: Vec<Value> = [
        root.clone(),
        format!("www.{root}"),
        format!("{PROVIDER_LABEL}.{root}"),
    ]
    .into_iter()
    .map(|pattern| json!({ "pattern": pattern, "custom_domain": true }))
    .collect();
    Ok(json!({
        "name": WORKER,
        "account_id": input.account_id,
        "main": "../../worker/src/index.ts",
        "compatibility_date": input.compatibility_date,
        "workers_dev": false,
        "preview_urls": false,
        "observability": { "enabled": true },
        "assets": {
            "directory": "../../worker/assets",
            "binding": "ASSETS",
            "not_found_handling": "none",
            "run_worker_first": true,
        },
        "vars": {
            "ENVIRONMENT": "production",
            "PUBLIC_ORIGIN": format!("https://{root}"),
            "OIDC_ISSUER": issuer(&root),
            "OIDC_CLIENT_ID": CLIENT_ID,
            "ROOT_DOMAIN": root,
            "FROM_EMAIL": sender(&root),
            "ESTATE_MANIFEST": registry.normalized(),
        },
        "kv_namespaces": [{ "binding": "SESSIONS", "id": input.kv_id }],
        "d1_databases": [{
            "binding": "DB",
            "database_name": WORKER,
            "database_id": input.d1_id,
            "migrations_dir": "../../worker/migrations",
        }],
        "services": services(&registry, str::to_owned),
        "ratelimits": rate_limits(false),
        "routes": routes,
    }))
}

pub fn local(root: &Path, manifest: &str, signing_key: &str) -> Result<Value, String> {
    let registry = registry(manifest)?;
    let path = |relative: &str| root.join(relative).to_string_lossy().into_owned();
    Ok(json!({
        "name": format!("local-{WORKER}"),
        "main": path("worker/src/index.ts"),
        "compatibility_date": compatibility_date(root)?,
        "workers_dev": true,
        "preview_urls": false,
        "observability": { "enabled": true },
        "rules": [{ "type": "CompiledWasm", "globs": ["**/*.wasm"], "fallthrough": true }],
        "assets": {
            "directory": path("worker/assets"),
            "binding": "ASSETS",
            "not_found_handling": "none",
            "run_worker_first": true,
        },
        "vars": {
            "ENVIRONMENT": "development",
            "PUBLIC_ORIGIN": "https://example.test",
            "OIDC_ISSUER": "http://127.0.0.1:8787",
            "OIDC_CLIENT_ID": CLIENT_ID,
            "OIDC_CLIENT_SECRET": "local-gateway-secret",
            "ROOT_DOMAIN": "example.test",
            "FROM_EMAIL": sender("example.test"),
            "ESTATE_MANIFEST": registry.normalized(),
            "OIDC_SIGNING_KEY": signing_key,
            "OIDC_SUB_SECRET": "local-pairwise-secret",
        },
        "kv_namespaces": [{ "binding": "SESSIONS", "id": "00000000000000000000000000000000" }],
        "d1_databases": [{
            "binding": "DB",
            "database_name": format!("local-{WORKER}"),
            "database_id": "00000000-0000-0000-0000-000000000000",
            "migrations_dir": path("worker/migrations"),
        }],
        "services": services(&registry, |service| format!("local-{service}")),
        "ratelimits": rate_limits(true),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../../tooling/e2e/fixture/estate.json");

    fn input(manifest: &str) -> Production<'_> {
        Production {
            account_id: "account",
            root_domain: "Product.Test.",
            manifest,
            d1_id: "d1-id",
            kv_id: "kv-id",
            compatibility_date: "2026-06-05",
        }
    }

    fn root() -> std::path::PathBuf {
        crate::root()
    }

    #[test]
    fn normalises_a_root_domain_and_refuses_anything_but_a_hostname() {
        assert_eq!(domain(" Example.COM. ").unwrap(), "example.com");
        for bad in [
            "https://example.com",
            "example.com/",
            "example",
            "exa mple.com",
            "-a.com",
            "a.c0m",
            "",
            "example.com:443",
        ] {
            assert!(domain(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn is_one_worker_with_one_database_and_one_namespace_named_pawl() {
        let config = production(&input("")).unwrap();
        assert_eq!(config["name"], "pawl");
        assert_eq!(config["d1_databases"][0]["database_name"], "pawl");
        assert_eq!(config["d1_databases"][0]["database_id"], "d1-id");
        assert_eq!(config["kv_namespaces"][0]["id"], "kv-id");
    }

    #[test]
    fn answers_only_on_its_own_domains_in_production() {
        assert_eq!(production(&input("")).unwrap()["workers_dev"], false);
        let local = local(&root(), "", "key").unwrap();
        assert_eq!(local["workers_dev"], true);
    }

    #[test]
    fn attaches_the_root_its_www_and_the_provider() {
        let config = production(&input("")).unwrap();
        let patterns: Vec<&str> = config["routes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|route| route["pattern"].as_str().unwrap())
            .collect();
        assert_eq!(
            patterns,
            ["product.test", "www.product.test", "paw.product.test"]
        );
    }

    #[test]
    fn derives_every_origin_and_the_sender_from_the_root_domain() {
        let vars = &production(&input("")).unwrap()["vars"];
        assert_eq!(vars["PUBLIC_ORIGIN"], "https://product.test");
        assert_eq!(vars["OIDC_ISSUER"], "https://paw.product.test");
        assert_eq!(vars["OIDC_CLIENT_ID"], "gateway");
        assert_eq!(vars["ROOT_DOMAIN"], "product.test");
        assert_eq!(vars["FROM_EMAIL"], "Pawl <no-reply@product.test>");
        assert_eq!(vars["ENVIRONMENT"], "production");
    }

    #[test]
    fn renders_pawl_alone_from_an_empty_manifest() {
        let config = production(&input("")).unwrap();
        assert_eq!(config["services"], json!([]));
        assert_eq!(
            config["vars"]["ESTATE_MANIFEST"]
                .as_str()
                .unwrap()
                .contains("Pawl"),
            true
        );
    }

    #[test]
    fn binds_each_routed_app_to_the_worker_it_names() {
        let config = production(&input(FIXTURE)).unwrap();
        assert_eq!(
            config["services"],
            json!([
                { "binding": "APP_NOTES", "service": "notes" },
                { "binding": "APP_DOCS", "service": "docs" },
            ])
        );
    }

    #[test]
    fn refuses_an_invalid_manifest_before_rendering_anything() {
        let error = production(&input(r#"{"site":{"name":""}}"#)).unwrap_err();
        assert!(error.contains("site name"), "{error}");
    }

    #[test]
    fn keeps_production_limits_tight_and_lets_a_local_suite_through() {
        let limit = |config: &Value| config["ratelimits"][0]["simple"]["limit"].clone();
        assert_eq!(limit(&production(&input("")).unwrap()), 30);
        assert_eq!(limit(&local(&root(), FIXTURE, "key").unwrap()), 1000);
    }

    #[test]
    fn counts_sign_ins_at_the_edge() {
        let config = production(&input("")).unwrap();
        let named = |name: &str| {
            config["ratelimits"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["name"] == name)
                .map(|entry| entry["simple"]["limit"].clone())
        };
        assert_eq!(named("SIGNIN_RATE_LIMIT"), Some(json!(10)));
        assert_eq!(named("SIGNIN_TRY_LIMIT"), Some(json!(30)));
        assert_eq!(named("SIGNIN_FAILURE_LIMIT"), Some(json!(10)));
    }

    #[test]
    fn renders_a_local_worker_bound_to_local_apps_with_a_throwaway_key() {
        let config = local(&root(), FIXTURE, "local-key").unwrap();
        assert_eq!(config["name"], "local-pawl");
        assert_eq!(config["d1_databases"][0]["database_name"], "local-pawl");
        assert_eq!(config["vars"]["OIDC_SIGNING_KEY"], "local-key");
        assert_eq!(config["vars"]["OIDC_ISSUER"], "http://127.0.0.1:8787");
        assert_eq!(config["vars"]["OIDC_CLIENT_SECRET"], "local-gateway-secret");
        assert_eq!(
            config["services"][0],
            json!({ "binding": "APP_NOTES", "service": "local-notes" })
        );
    }

    #[test]
    fn renders_on_the_compatibility_date_of_the_workers_own_config() {
        let date = compatibility_date(&root()).unwrap();
        assert_eq!(
            local(&root(), "", "key").unwrap()["compatibility_date"],
            date.as_str()
        );
    }
}
