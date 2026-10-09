use wasm_bindgen::prelude::*;

use crate::jose::{self, Jwk};

#[wasm_bindgen(js_name = publicJwk)]
pub fn public_jwk(pkcs8: &str) -> Result<String, JsError> {
    let jwk = jose::public_jwk(pkcs8).map_err(|error| JsError::new(&error.0))?;
    serde_json::to_string(&jwk).map_err(|error| JsError::new(&error.to_string()))
}

#[wasm_bindgen(js_name = signJwt)]
pub fn sign_jwt(pkcs8: &str, claims_json: &str) -> Result<String, JsError> {
    jose::sign(pkcs8, claims_json).map_err(|error| JsError::new(&error.0))
}

#[wasm_bindgen(js_name = verifyJwt)]
pub fn verify_jwt(
    token: &str,
    jwks_json: &str,
    issuer: &str,
    audience: &str,
    now_seconds: f64,
) -> String {
    let Ok(jwks) = serde_json::from_str::<Vec<Jwk>>(jwks_json) else {
        return String::new();
    };
    jose::verify(token, &jwks, issuer, audience, now_seconds.max(0.0) as u64)
        .map(|claims| claims.to_string())
        .unwrap_or_default()
}

#[wasm_bindgen(js_name = pkceS256)]
pub fn pkce_s256(verifier: &str) -> String {
    jose::pkce_s256(verifier)
}

#[wasm_bindgen(js_name = pairwiseSub)]
pub fn pairwise_sub(secret: &str, sector: &str, user_id: &str) -> String {
    jose::pairwise_sub(secret, sector, user_id)
}
