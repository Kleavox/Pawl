use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use p256::SecretKey;
use p256::pkcs8::EncodePrivateKey;
use rand_core::{OsRng, RngCore};

pub struct Generated {
    pub signing_key: String,
    pub sub_secret: String,
}

pub fn secret() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn generate() -> Generated {
    let der = SecretKey::random(&mut OsRng)
        .to_pkcs8_der()
        .expect("a fresh P-256 key encodes as PKCS#8");
    Generated {
        signing_key: STANDARD.encode(der.as_bytes()),
        sub_secret: secret(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_a_key_the_provider_can_read_and_a_fresh_pairwise_secret() {
        let first = generate();
        let second = generate();
        assert!(oidc::public_jwk(&first.signing_key).is_ok());
        assert_ne!(first.signing_key, second.signing_key);
        assert_ne!(first.sub_secret, second.sub_secret);
        assert_eq!(first.sub_secret.len(), 43);
    }
}
