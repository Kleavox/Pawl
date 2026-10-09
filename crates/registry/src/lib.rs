mod manifest;
mod registry;
mod validate;
mod wasm;

pub use manifest::{Access, Apex, App, Header, Local, Manifest, Site};
pub use registry::{
    ApexTarget, BayView, Binding, FooterLink, PublicView, Registry, Route, Shape, SiteView, Target,
    Tool,
};
pub use validate::{RESERVED_PATHS, validate};

pub fn parse(json: &str) -> Result<Manifest, Vec<String>> {
    let manifest: Manifest =
        serde_json::from_str(json).map_err(|cause| vec![format!("manifest: {cause}")])?;
    validate(&manifest)?;
    Ok(manifest)
}
