use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub site: Site,
    #[serde(default)]
    pub apps: Vec<App>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Site {
    pub name: String,
    #[serde(default)]
    pub reserved_slugs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct App {
    pub key: String,
    pub label: String,
    pub title: String,
    #[serde(default)]
    pub subdomain: Option<String>,
    #[serde(default)]
    pub service: Option<String>,
    #[serde(default)]
    pub proxy: Vec<String>,
    #[serde(default)]
    pub apex: Option<Apex>,
    #[serde(default)]
    pub estate: bool,
    #[serde(default)]
    pub purge: bool,
    #[serde(default)]
    pub header: Option<Header>,
    #[serde(default)]
    pub access: Option<Access>,
    #[serde(default)]
    pub bay: Option<String>,
    #[serde(default)]
    pub local: Option<Local>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Apex {
    pub resolve: String,
    #[serde(default)]
    pub file_slug_prefix: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Header {
    pub noun: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Access {
    Public,
    Visitor,
    Owner,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Local {
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub vite_port: Option<u16>,
}
