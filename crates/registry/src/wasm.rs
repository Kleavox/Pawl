use wasm_bindgen::prelude::*;

use crate::registry::Registry;

fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_owned())
}

#[wasm_bindgen]
pub struct WasmRegistry {
    inner: Registry,
}

#[wasm_bindgen]
impl WasmRegistry {
    #[wasm_bindgen(constructor)]
    pub fn new(manifest: &str) -> Result<WasmRegistry, JsError> {
        Registry::new(manifest)
            .map(|inner| WasmRegistry { inner })
            .map_err(|problems| JsError::new(&problems.join("\n")))
    }

    pub fn route(&self, host: &str, root_host: &str, path: &str) -> String {
        json(&self.inner.route(host, root_host, path))
    }

    pub fn apex(&self) -> String {
        json(&self.inner.apex())
    }

    #[wasm_bindgen(js_name = estateTargets)]
    pub fn estate_targets(&self) -> String {
        json(&self.inner.estate_targets())
    }

    #[wasm_bindgen(js_name = purgeTargets)]
    pub fn purge_targets(&self) -> String {
        json(&self.inner.purge_targets())
    }

    pub fn bindings(&self) -> String {
        json(&self.inner.bindings())
    }

    #[wasm_bindgen(js_name = isReserved)]
    pub fn is_reserved(&self, slug: &str) -> bool {
        self.inner.is_reserved(slug)
    }

    #[wasm_bindgen(js_name = reservedSlugs)]
    pub fn reserved_slugs(&self) -> String {
        json(&self.inner.reserved_slugs())
    }

    #[wasm_bindgen(js_name = publicView)]
    pub fn public_view(&self, root_origin: &str, pass_origin: &str) -> String {
        json(&self.inner.public_view(root_origin, pass_origin))
    }

    pub fn normalized(&self) -> String {
        self.inner.normalized()
    }

    #[wasm_bindgen(js_name = siteName)]
    pub fn site_name(&self) -> String {
        self.inner.manifest().site.name.clone()
    }
}
