use serde::Serialize;

use crate::manifest::{Access, App, Manifest};
use crate::parse;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    Tall,
    Wide,
}

const BAY_COUNT: u32 = 9;
const TALL_LIMIT: usize = 4;

fn fnv1a32(value: &str) -> u32 {
    value.bytes().fold(0x811c_9dc5_u32, |hash, byte| {
        (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193)
    })
}

const BASE_RESERVED: [&str; 15] = [
    "account",
    "api",
    "assets",
    "favicon.ico",
    "health",
    "login",
    "oauth",
    "pass",
    "paw",
    "pawl",
    "privacy",
    "ready",
    "robots.txt",
    "sitemap.xml",
    "terms",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Registry {
    manifest: Manifest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Route {
    Subdomain {
        key: String,
        binding: String,
    },
    Proxy {
        key: String,
        binding: String,
        host: String,
    },
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Binding {
    pub binding: String,
    pub service: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Target {
    pub key: String,
    pub binding: String,
    pub host: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexTarget {
    pub key: String,
    pub binding: String,
    pub host: String,
    pub resolve: String,
    pub file_slug_prefix: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SiteView {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Tool {
    pub key: String,
    pub label: String,
    pub noun: String,
    pub origin: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BayView {
    pub code: String,
    pub key: String,
    pub estate: bool,
    pub product: String,
    pub chars: usize,
    pub title: String,
    pub access: Access,
    pub shape: Shape,
    pub href: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FooterLink {
    pub title: String,
    pub href: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PublicView {
    pub site: SiteView,
    pub tools: Vec<Tool>,
    pub bays: Vec<BayView>,
    pub footer: Vec<FooterLink>,
}

fn binding_for(key: &str) -> String {
    format!("APP_{}", key.to_ascii_uppercase())
}

fn host_for(key: &str) -> String {
    format!("{key}.internal")
}

fn split_origin(origin: &str) -> (String, String) {
    let (scheme, rest) = origin.split_once("://").unwrap_or(("https", origin));
    let host = rest.split('/').next().unwrap_or(rest);
    (scheme.to_owned(), host.to_owned())
}

fn hostname(host: &str) -> &str {
    if let Some(stripped) = host.strip_prefix('[') {
        return stripped.split(']').next().unwrap_or(stripped);
    }
    host.split(':').next().unwrap_or(host)
}

fn is_loopback(name: &str) -> bool {
    name == "localhost" || name.ends_with(".localhost") || name == "::1" || name.starts_with("127.")
}

impl Registry {
    pub fn new(json: &str) -> Result<Registry, Vec<String>> {
        parse(json).map(|manifest| Registry { manifest })
    }

    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    pub fn normalized(&self) -> String {
        serde_json::to_string(&self.manifest).unwrap_or_default()
    }

    fn routed(&self) -> impl Iterator<Item = &App> {
        self.manifest
            .apps
            .iter()
            .filter(|app| app.service.is_some())
    }

    pub fn route(&self, host: &str, root_host: &str, path: &str) -> Route {
        let host = host.to_ascii_lowercase();
        let root = root_host.to_ascii_lowercase();
        if host == root {
            for app in self.routed() {
                let hit = app.proxy.iter().any(|prefix| {
                    path.starts_with(prefix.as_str()) || path == prefix.trim_end_matches('/')
                });
                if hit {
                    return Route::Proxy {
                        key: app.key.clone(),
                        binding: binding_for(&app.key),
                        host: host_for(&app.key),
                    };
                }
            }
            return Route::None;
        }
        let Some(label) = host.strip_suffix(&format!(".{root}")) else {
            return Route::None;
        };
        self.routed()
            .find(|app| app.subdomain.as_deref() == Some(label))
            .map_or(Route::None, |app| Route::Subdomain {
                key: app.key.clone(),
                binding: binding_for(&app.key),
            })
    }

    pub fn apex(&self) -> Option<ApexTarget> {
        self.manifest.apps.iter().find_map(|app| {
            app.apex.as_ref().map(|apex| ApexTarget {
                key: app.key.clone(),
                binding: binding_for(&app.key),
                host: host_for(&app.key),
                resolve: apex.resolve.clone(),
                file_slug_prefix: apex.file_slug_prefix.clone(),
            })
        })
    }

    fn targets(&self, wanted: impl Fn(&App) -> bool) -> Vec<Target> {
        self.manifest
            .apps
            .iter()
            .filter(|app| wanted(app))
            .map(|app| Target {
                key: app.key.clone(),
                binding: binding_for(&app.key),
                host: host_for(&app.key),
            })
            .collect()
    }

    pub fn estate_targets(&self) -> Vec<Target> {
        self.targets(|app| app.estate)
    }

    pub fn purge_targets(&self) -> Vec<Target> {
        self.targets(|app| app.purge)
    }

    pub fn bindings(&self) -> Vec<Binding> {
        self.routed()
            .map(|app| Binding {
                binding: binding_for(&app.key),
                service: app.service.clone().unwrap_or_default(),
            })
            .collect()
    }

    pub fn reserved_slugs(&self) -> Vec<String> {
        let mut slugs: Vec<String> = BASE_RESERVED
            .iter()
            .map(|slug| (*slug).to_owned())
            .collect();
        slugs.extend(self.manifest.site.reserved_slugs.iter().cloned());
        for app in &self.manifest.apps {
            slugs.push(app.key.clone());
            slugs.push(app.label.clone());
            slugs.extend(app.subdomain.iter().cloned());
            for prefix in app
                .proxy
                .iter()
                .chain(app.apex.iter().map(|apex| &apex.resolve))
            {
                if let Some(first) = prefix.trim_start_matches('/').split('/').next() {
                    slugs.push(first.to_owned());
                }
            }
        }
        slugs.sort();
        slugs.dedup();
        slugs
    }

    pub fn is_reserved(&self, slug: &str) -> bool {
        let wanted = slug.trim().to_ascii_lowercase();
        self.reserved_slugs()
            .iter()
            .any(|reserved| *reserved == wanted)
    }

    fn origin_of(&self, app: &App, scheme: &str, root_host: &str) -> Option<String> {
        let name = hostname(root_host);
        if is_loopback(name) {
            let local = app.local.as_ref()?;
            let port = local.port.or(local.vite_port)?;
            let shown = if root_host.starts_with('[') {
                format!("[{name}]")
            } else {
                name.to_owned()
            };
            return Some(format!("http://{shown}:{port}"));
        }
        let label = app.subdomain.as_ref()?;
        Some(format!("{scheme}://{label}.{root_host}"))
    }

    pub fn placements(&self) -> Vec<(String, String)> {
        let mut taken = [false; BAY_COUNT as usize + 1];
        let mut placed: Vec<(String, String)> = Vec::new();
        for app in self
            .manifest
            .apps
            .iter()
            .filter(|app| app.subdomain.is_some())
        {
            if let Some(pin) = app.bay.as_deref().and_then(|pin| pin.parse::<usize>().ok()) {
                taken[pin] = true;
                placed.push((app.key.clone(), pin.to_string()));
            }
        }
        for app in self
            .manifest
            .apps
            .iter()
            .filter(|app| app.subdomain.is_some() && app.bay.is_none())
        {
            let first = fnv1a32(&app.key) % BAY_COUNT;
            let free = (0..BAY_COUNT)
                .map(|step| ((first + step) % BAY_COUNT + 1) as usize)
                .find(|code| !taken[*code]);
            if let Some(code) = free {
                taken[code] = true;
                placed.push((app.key.clone(), code.to_string()));
            }
        }
        placed
    }

    pub fn public_view(&self, root_origin: &str, pass_origin: &str) -> PublicView {
        let placements = self.placements();
        let (scheme, root_host) = split_origin(root_origin);
        let mut tools = vec![Tool {
            key: "pass".into(),
            label: "pawl".into(),
            noun: "devices".into(),
            origin: pass_origin.to_owned(),
        }];
        let mut bays = Vec::new();
        let mut footer = Vec::new();
        for app in &self.manifest.apps {
            let Some(origin) = self.origin_of(app, &scheme, &root_host) else {
                continue;
            };
            if let Some(header) = &app.header {
                tools.push(Tool {
                    key: app.key.clone(),
                    label: app.label.clone(),
                    noun: header.noun.clone(),
                    origin: origin.clone(),
                });
            }
            if let Some((_, code)) = placements.iter().find(|(key, _)| *key == app.key) {
                let product = app.label.to_ascii_uppercase();
                let chars = product.chars().count();
                bays.push(BayView {
                    code: code.clone(),
                    key: app.key.clone(),
                    estate: app.estate,
                    product,
                    chars,
                    title: app.title.clone(),
                    access: app.access.unwrap_or(Access::Public),
                    shape: if chars <= TALL_LIMIT {
                        Shape::Tall
                    } else {
                        Shape::Wide
                    },
                    href: origin.clone(),
                });
            }
            footer.push(FooterLink {
                title: app.title.clone(),
                href: origin,
            });
        }
        bays.sort_by(|a, b| a.code.cmp(&b.code));
        PublicView {
            site: SiteView {
                name: self.manifest.site.name.clone(),
            },
            tools,
            bays,
            footer,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JSON: &str = r#"{
      "site": { "name": "Example", "reservedSlugs": ["blog"] },
      "apps": [
        { "key": "notes", "label": "notes", "title": "Notes", "subdomain": "notes",
          "service": "notes", "proxy": ["/api/notes/", "/note-assets/"],
          "apex": { "resolve": "/internal/resolve/", "fileSlugPrefix": "n_" },
          "estate": true, "purge": true, "header": { "noun": "notes" },
          "access": "visitor", "local": { "port": 8790 } },
        { "key": "docs", "label": "docs", "title": "Docs", "subdomain": "docs",
          "service": "docs", "local": { "vitePort": 3004 } }
      ]
    }"#;

    fn registry() -> Registry {
        Registry::new(JSON).expect("valid")
    }

    const WITH_LINK: &str = r#"{
      "site": { "name": "Example" },
      "apps": [
        { "key": "docs", "label": "docs", "title": "Docs", "subdomain": "docs",
          "service": "docs" },
        { "key": "kry", "label": "kry", "title": "Krynodes", "subdomain": "kry" }
      ]
    }"#;

    #[test]
    fn lists_a_link_only_app_at_its_own_subdomain() {
        let view = Registry::new(WITH_LINK)
            .expect("valid")
            .public_view("https://example.test", "https://paw.example.test");
        assert!(
            view.bays
                .iter()
                .any(|bay| bay.title == "Krynodes" && bay.href == "https://kry.example.test")
        );
        assert!(
            view.footer
                .iter()
                .any(|link| link.title == "Krynodes" && link.href == "https://kry.example.test")
        );
    }

    #[test]
    fn tells_each_bay_which_app_it_holds_and_whether_it_reports_an_estate() {
        let view = registry().public_view("https://example.test", "https://paw.example.test");
        let notes = view
            .bays
            .iter()
            .find(|bay| bay.title == "Notes")
            .expect("notes bay");
        assert_eq!(notes.key, "notes");
        assert!(notes.estate);
        let docs = view
            .bays
            .iter()
            .find(|bay| bay.title == "Docs")
            .expect("docs bay");
        assert_eq!(docs.key, "docs");
        assert!(!docs.estate);
        let link = Registry::new(WITH_LINK)
            .expect("valid")
            .public_view("https://example.test", "https://paw.example.test");
        let kry = link
            .bays
            .iter()
            .find(|bay| bay.key == "kry")
            .expect("kry bay");
        assert!(!kry.estate);
    }

    #[test]
    fn never_routes_or_binds_a_link_only_app() {
        let registry = Registry::new(WITH_LINK).expect("valid");
        assert_eq!(
            registry.route("kry.example.test", "example.test", "/"),
            Route::None
        );
        assert!(
            registry
                .bindings()
                .iter()
                .all(|binding| binding.binding != binding_for("kry"))
        );
    }

    #[test]
    fn routes_an_app_subdomain_to_its_binding() {
        assert_eq!(
            registry().route("notes.example.test", "example.test", "/x"),
            Route::Subdomain {
                key: "notes".into(),
                binding: "APP_NOTES".into()
            }
        );
    }

    #[test]
    fn routes_a_proxy_prefix_on_the_root_host_with_the_internal_host() {
        assert_eq!(
            registry().route("example.test", "example.test", "/api/notes/list"),
            Route::Proxy {
                key: "notes".into(),
                binding: "APP_NOTES".into(),
                host: "notes.internal".into()
            }
        );
        assert_eq!(
            registry().route("example.test", "example.test", "/api/notes"),
            Route::Proxy {
                key: "notes".into(),
                binding: "APP_NOTES".into(),
                host: "notes.internal".into()
            }
        );
    }

    #[test]
    fn leaves_everything_else_to_pawl() {
        let registry = registry();
        assert_eq!(
            registry.route("example.test", "example.test", "/api/estate"),
            Route::None
        );
        assert_eq!(
            registry.route("example.test", "example.test", "/api/notesx"),
            Route::None
        );
        assert_eq!(
            registry.route("paw.example.test", "example.test", "/"),
            Route::None
        );
        assert_eq!(
            registry.route("notes.example.test.evil", "example.test", "/"),
            Route::None
        );
    }

    #[test]
    fn matches_hosts_without_regard_to_case() {
        assert_eq!(
            registry().route("NOTES.Example.Test", "example.test", "/"),
            Route::Subdomain {
                key: "notes".into(),
                binding: "APP_NOTES".into()
            }
        );
    }

    #[test]
    fn reserves_pawl_its_apps_and_the_site_extras() {
        let registry = registry();
        for slug in [
            "api",
            "oauth",
            "pawl",
            "privacy",
            "notes",
            "docs",
            "note-assets",
            "internal",
            "blog",
        ] {
            assert!(registry.is_reserved(slug), "{slug}");
        }
        assert!(registry.is_reserved("  NOTES "));
        assert!(!registry.is_reserved("launch-notes"));
    }

    #[test]
    fn names_each_routed_apps_binding() {
        assert_eq!(
            registry().bindings(),
            vec![
                Binding {
                    binding: "APP_NOTES".into(),
                    service: "notes".into()
                },
                Binding {
                    binding: "APP_DOCS".into(),
                    service: "docs".into()
                },
            ]
        );
    }

    #[test]
    fn lists_estate_and_purge_targets() {
        let expected = vec![Target {
            key: "notes".into(),
            binding: "APP_NOTES".into(),
            host: "notes.internal".into(),
        }];
        assert_eq!(registry().estate_targets(), expected);
        assert_eq!(registry().purge_targets(), expected);
    }

    #[test]
    fn hands_the_apex_to_its_one_app() {
        assert_eq!(
            registry().apex(),
            Some(ApexTarget {
                key: "notes".into(),
                binding: "APP_NOTES".into(),
                host: "notes.internal".into(),
                resolve: "/internal/resolve/".into(),
                file_slug_prefix: Some("n_".into()),
            })
        );
    }

    #[test]
    fn builds_public_origins_on_a_real_domain() {
        let view = registry().public_view("https://example.test", "https://paw.example.test");
        assert_eq!(view.site.name, "Example");
        assert_eq!(
            view.tools,
            vec![
                Tool {
                    key: "pass".into(),
                    label: "pawl".into(),
                    noun: "devices".into(),
                    origin: "https://paw.example.test".into()
                },
                Tool {
                    key: "notes".into(),
                    label: "notes".into(),
                    noun: "notes".into(),
                    origin: "https://notes.example.test".into()
                },
            ]
        );
        assert_eq!(view.bays[0].href, "https://notes.example.test");
        assert_eq!(view.bays[1].code, "7");
        assert_eq!(
            view.footer[1],
            FooterLink {
                title: "Docs".into(),
                href: "https://docs.example.test".into()
            }
        );
    }

    #[test]
    fn places_each_app_by_its_key_without_being_told() {
        let codes: Vec<(String, String)> = registry()
            .public_view("https://example.test", "https://paw.example.test")
            .bays
            .into_iter()
            .map(|bay| (bay.title, bay.code))
            .collect();
        assert_eq!(
            codes,
            vec![("Notes".into(), "2".into()), ("Docs".into(), "7".into())]
        );
    }

    #[test]
    fn moves_a_newcomer_on_a_collision_and_never_the_app_already_there() {
        let crowded = JSON.replace(
            r#""local": { "vitePort": 3004 } }"#,
            r#""local": { "vitePort": 3004 } },
        { "key": "blog", "label": "blog", "title": "Blog", "subdomain": "blog", "service": "blog" }"#,
        );
        let view = Registry::new(&crowded)
            .expect("valid")
            .public_view("https://example.test", "https://paw.example.test");
        let code = |title: &str| {
            view.bays
                .iter()
                .find(|bay| bay.title == title)
                .map(|bay| bay.code.clone())
        };
        assert_eq!(code("Docs").as_deref(), Some("7"));
        assert_eq!(code("Blog").as_deref(), Some("8"));
    }

    #[test]
    fn honours_a_pin_before_placing_anyone_else() {
        let pinned = JSON.replace(
            r#""key": "docs", "label": "docs","#,
            r#""key": "docs", "label": "docs", "bay": "2","#,
        );
        let view = Registry::new(&pinned)
            .expect("valid")
            .public_view("https://example.test", "https://paw.example.test");
        let code = |title: &str| {
            view.bays
                .iter()
                .find(|bay| bay.title == title)
                .map(|bay| bay.code.clone())
        };
        assert_eq!(code("Docs").as_deref(), Some("2"));
        assert_eq!(code("Notes").as_deref(), Some("3"));
    }

    #[test]
    fn prints_the_label_and_picks_the_shape_from_its_length() {
        let view = registry().public_view("https://example.test", "https://paw.example.test");
        let notes = &view.bays[0];
        let docs = &view.bays[1];
        assert_eq!(
            (notes.product.as_str(), notes.shape, notes.chars),
            ("NOTES", Shape::Wide, 5)
        );
        assert_eq!(
            (docs.product.as_str(), docs.shape, docs.chars),
            ("DOCS", Shape::Tall, 4)
        );
    }

    #[test]
    fn lets_anyone_take_a_bay_unless_the_manifest_says_otherwise() {
        let view = registry().public_view("https://example.test", "https://paw.example.test");
        assert_eq!(view.bays[0].access, Access::Visitor);
        assert_eq!(view.bays[1].access, Access::Public);
    }

    #[test]
    fn builds_local_origins_from_declared_ports() {
        let view = registry().public_view("http://127.0.0.1:8786", "http://127.0.0.1:8787");
        assert_eq!(view.tools[1].origin, "http://127.0.0.1:8790");
        assert_eq!(view.bays[1].href, "http://127.0.0.1:3004");
    }

    #[test]
    fn round_trips_to_the_same_manifest() {
        let registry = registry();
        assert_eq!(
            Registry::new(&registry.normalized()).expect("valid"),
            registry
        );
    }
}
