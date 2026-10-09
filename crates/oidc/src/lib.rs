mod jose;
mod wasm;

pub use jose::{Jwk, OidcError, pairwise_sub, pkce_s256, public_jwk, sign, verify};

#[cfg(test)]
mod tests {
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixture.pkcs8.b64");
    const FIXTURE_X: &str = "iCri0ary9fYGtTNSAMNhHoeHRdoISnIPHYle1dGyNJI";
    const FIXTURE_Y: &str = "-89lddUyUSX7iZcChkkG-k6UcsWFrm_bU0bb7HCzODs";
    const FIXTURE_KID: &str = "_DzpF-oyNGCfIkLaTUd4lah5WvhezA-uLNdbVFyZbQ0";
    const ISSUER: &str = "https://paw.example.test";

    fn key() -> &'static str {
        FIXTURE.trim()
    }

    fn token(claims: serde_json::Value) -> String {
        sign(key(), &claims.to_string()).expect("signs")
    }

    fn jwks() -> Vec<Jwk> {
        vec![public_jwk(key()).expect("parses")]
    }

    #[test]
    fn reads_a_key_webcrypto_exported() {
        let jwk = public_jwk(key()).expect("parses");
        assert_eq!((jwk.x.as_str(), jwk.y.as_str()), (FIXTURE_X, FIXTURE_Y));
    }

    #[test]
    fn names_the_key_by_the_thumbprint_webcrypto_computes() {
        assert_eq!(public_jwk(key()).expect("parses").kid, FIXTURE_KID);
    }

    #[test]
    fn publishes_no_private_material() {
        let published = serde_json::to_value(public_jwk(key()).expect("parses")).expect("json");
        assert!(published.get("d").is_none());
        assert_eq!(published["alg"], "ES256");
        assert_eq!(published["use"], "sig");
    }

    #[test]
    fn signs_a_jws_with_a_raw_sixty_four_byte_signature_and_the_kid() {
        let jws = token(
            serde_json::json!({ "iss": ISSUER, "aud": "a", "sub": "u", "exp": 2_000_000_000u64 }),
        );
        let parts: Vec<&str> = jws.split('.').collect();
        assert_eq!(parts.len(), 3);
        let header: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).expect("b64")).expect("json");
        assert_eq!(header["alg"], "ES256");
        assert_eq!(header["kid"], FIXTURE_KID);
        assert_eq!(URL_SAFE_NO_PAD.decode(parts[2]).expect("b64").len(), 64);
    }

    #[test]
    fn verifies_what_it_signed_for_the_audience_asking() {
        let jws = token(
            serde_json::json!({ "iss": ISSUER, "aud": ["desmyx", ISSUER], "sub": "u", "exp": 2_000_000_000u64 }),
        );
        assert_eq!(
            verify(&jws, &jwks(), ISSUER, ISSUER, 1_900_000_000).expect("valid")["sub"],
            "u"
        );
    }

    #[test]
    fn refuses_another_audience_another_issuer_an_expired_token() {
        let jws = token(
            serde_json::json!({ "iss": ISSUER, "aud": "desmyx", "sub": "u", "exp": 1_900_000_000u64 }),
        );
        assert!(verify(&jws, &jwks(), ISSUER, "elsewhere", 1_800_000_000).is_none());
        assert!(verify(&jws, &jwks(), "https://other.test", "desmyx", 1_800_000_000).is_none());
        assert!(verify(&jws, &jwks(), ISSUER, "desmyx", 1_900_000_000).is_none());
        assert!(verify(&jws, &jwks(), ISSUER, "desmyx", 1_899_999_999).is_some());
    }

    #[test]
    fn refuses_a_payload_altered_after_signing() {
        let jws = token(
            serde_json::json!({ "iss": ISSUER, "aud": ISSUER, "sub": "u", "exp": 2_000_000_000u64 }),
        );
        let parts: Vec<&str> = jws.split('.').collect();
        let forged = URL_SAFE_NO_PAD.encode(
            serde_json::json!({ "iss": ISSUER, "aud": ISSUER, "sub": "admin", "exp": 2_000_000_000u64 }).to_string(),
        );
        assert!(
            verify(
                &format!("{}.{forged}.{}", parts[0], parts[2]),
                &jwks(),
                ISSUER,
                ISSUER,
                1
            )
            .is_none()
        );
    }

    #[test]
    fn refuses_alg_none_an_unknown_kid_and_garbage() {
        let body = URL_SAFE_NO_PAD.encode(format!(
            r#"{{"iss":"{ISSUER}","aud":"{ISSUER}","exp":9999999999}}"#
        ));
        let none = URL_SAFE_NO_PAD.encode(r#"{"alg":"none"}"#);
        assert!(verify(&format!("{none}.{body}."), &jwks(), ISSUER, ISSUER, 1).is_none());
        let stranger = URL_SAFE_NO_PAD.encode(r#"{"alg":"ES256","kid":"someone-else"}"#);
        assert!(
            verify(
                &format!("{stranger}.{body}.AAAA"),
                &jwks(),
                ISSUER,
                ISSUER,
                1
            )
            .is_none()
        );
        assert!(verify("not.a.token", &jwks(), ISSUER, ISSUER, 1).is_none());
        assert!(verify("a.b.c.d", &jwks(), ISSUER, ISSUER, 1).is_none());
        assert!(verify("", &jwks(), ISSUER, ISSUER, 1).is_none());
    }

    #[test]
    fn computes_the_pkce_challenge_of_rfc_7636_appendix_b() {
        assert_eq!(
            pkce_s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn derives_a_stable_pairwise_sub_per_sector() {
        let a = pairwise_sub("secret", "a.test", "user-1");
        assert_eq!(a, pairwise_sub("secret", "a.test", "user-1"));
        assert_ne!(a, pairwise_sub("secret", "b.test", "user-1"));
        assert_ne!(a, pairwise_sub("other", "a.test", "user-1"));
        assert_ne!(a, "user-1");
    }
}
