use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use p256::ecdsa::signature::{Signer, Verifier};
use p256::ecdsa::{Signature, SigningKey, VerifyingKey};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::pkcs8::DecodePrivateKey;
use p256::{EncodedPoint, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug)]
pub struct OidcError(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Jwk {
    pub kty: String,
    pub crv: String,
    pub x: String,
    pub y: String,
    pub alg: String,
    #[serde(rename = "use")]
    pub usage: String,
    pub kid: String,
}

fn secret(pkcs8_b64: &str) -> Result<SecretKey, OidcError> {
    let der = STANDARD
        .decode(pkcs8_b64.trim())
        .map_err(|cause| OidcError(format!("signing key is not base64: {cause}")))?;
    SecretKey::from_pkcs8_der(&der)
        .map_err(|cause| OidcError(format!("signing key is not PKCS#8 P-256: {cause}")))
}

fn thumbprint(x: &str, y: &str) -> String {
    let canonical = format!(r#"{{"crv":"P-256","kty":"EC","x":"{x}","y":"{y}"}}"#);
    URL_SAFE_NO_PAD.encode(Sha256::digest(canonical.as_bytes()))
}

pub fn public_jwk(pkcs8_b64: &str) -> Result<Jwk, OidcError> {
    let point = secret(pkcs8_b64)?.public_key().to_encoded_point(false);
    let x = URL_SAFE_NO_PAD.encode(
        point
            .x()
            .ok_or_else(|| OidcError("public key has no x".into()))?,
    );
    let y = URL_SAFE_NO_PAD.encode(
        point
            .y()
            .ok_or_else(|| OidcError("public key has no y".into()))?,
    );
    Ok(Jwk {
        kid: thumbprint(&x, &y),
        kty: "EC".into(),
        crv: "P-256".into(),
        x,
        y,
        alg: "ES256".into(),
        usage: "sig".into(),
    })
}

pub fn sign(pkcs8_b64: &str, claims_json: &str) -> Result<String, OidcError> {
    let kid = public_jwk(pkcs8_b64)?.kid;
    let header = serde_json::json!({ "alg": "ES256", "typ": "JWT", "kid": kid }).to_string();
    let input = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(header),
        URL_SAFE_NO_PAD.encode(claims_json)
    );
    let signature: Signature = SigningKey::from(secret(pkcs8_b64)?).sign(input.as_bytes());
    Ok(format!(
        "{input}.{}",
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    ))
}

fn verifying_key(jwk: &Jwk) -> Option<VerifyingKey> {
    let x = URL_SAFE_NO_PAD.decode(&jwk.x).ok()?;
    let y = URL_SAFE_NO_PAD.decode(&jwk.y).ok()?;
    if x.len() != 32 || y.len() != 32 {
        return None;
    }
    let point =
        EncodedPoint::from_affine_coordinates(x.as_slice().into(), y.as_slice().into(), false);
    VerifyingKey::from_encoded_point(&point).ok()
}

fn decoded(segment: &str) -> Option<serde_json::Value> {
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(segment).ok()?).ok()
}

pub fn verify(
    token: &str,
    jwks: &[Jwk],
    issuer: &str,
    audience: &str,
    now: u64,
) -> Option<serde_json::Value> {
    let (input, signature) = token.rsplit_once('.')?;
    let (header, payload) = input.split_once('.')?;
    if payload.contains('.') {
        return None;
    }
    let header = decoded(header)?;
    if header.get("alg")?.as_str()? != "ES256" {
        return None;
    }
    let kid = header.get("kid")?.as_str()?;
    let key = verifying_key(jwks.iter().find(|jwk| jwk.kid == kid)?)?;
    let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(signature).ok()?).ok()?;
    key.verify(input.as_bytes(), &signature).ok()?;
    let claims = decoded(payload)?;
    if claims.get("iss")?.as_str()? != issuer {
        return None;
    }
    let audience_ok = match claims.get("aud")? {
        serde_json::Value::String(single) => single == audience,
        serde_json::Value::Array(many) => many.iter().any(|entry| entry.as_str() == Some(audience)),
        _ => false,
    };
    if !audience_ok || claims.get("exp")?.as_u64()? <= now {
        return None;
    }
    Some(claims)
}

pub fn pkce_s256(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn pairwise_sub(secret: &str, sector: &str, user_id: &str) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC takes a key of any length");
    mac.update(format!("{sector} {user_id}").as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}
