#![deny(dead_code)]

use aead_stream::{DecryptorBE32, EncryptorBE32};
use aes_gcm::{Aes256Gcm, aead::KeyInit};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hash_password(password: &str, salt: &str) -> Result<String, JsValue> {
    let standard_salt = salt.replace("-", "+").replace("_", "/");
    let salt_string = SaltString::from_b64(&standard_salt)
        .map_err(|e| JsValue::from_str(&format!("Invalid salt: {}", e)))?;

    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt_string)
        .map_err(|e| JsValue::from_str(&e.to_string()))?
        .to_string();
    Ok(password_hash)
}

#[wasm_bindgen]
pub fn verify_password(password: &str, hash: &str) -> Result<bool, JsValue> {
    let parsed_hash = PasswordHash::new(hash).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

#[wasm_bindgen]
pub fn derive_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut out = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(out.to_vec())
}

fn stream_cipher(key: &[u8]) -> Result<Aes256Gcm, JsValue> {
    if key.len() != 32 {
        return Err(JsValue::from_str("key must be 32 bytes"));
    }
    Aes256Gcm::new_from_slice(key).map_err(|_| JsValue::from_str("key must be 32 bytes"))
}

#[wasm_bindgen]
pub struct StreamEncryptor {
    inner: Option<EncryptorBE32<Aes256Gcm>>,
}

impl StreamEncryptor {
    fn push_inner(&mut self, chunk: &[u8], is_last: bool) -> Result<Vec<u8>, &'static str> {
        if is_last {
            let stream = self.inner.take().ok_or("stream already finished")?;
            stream.encrypt_last(chunk).map_err(|_| "encryption failed")
        } else {
            let stream = self.inner.as_mut().ok_or("stream already finished")?;
            stream.encrypt_next(chunk).map_err(|_| "encryption failed")
        }
    }
}

#[wasm_bindgen]
impl StreamEncryptor {
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u8]) -> Result<StreamEncryptor, JsValue> {
        let cipher = stream_cipher(key)?;
        Ok(StreamEncryptor {
            inner: Some(EncryptorBE32::from_aead(cipher, &Default::default())),
        })
    }

    pub fn push(&mut self, chunk: &[u8], is_last: bool) -> Result<Vec<u8>, JsValue> {
        self.push_inner(chunk, is_last).map_err(JsValue::from_str)
    }
}

#[wasm_bindgen]
pub struct StreamDecryptor {
    inner: Option<DecryptorBE32<Aes256Gcm>>,
}

impl StreamDecryptor {
    fn push_inner(&mut self, chunk: &[u8], is_last: bool) -> Result<Vec<u8>, &'static str> {
        if is_last {
            let stream = self.inner.take().ok_or("stream already finished")?;
            stream.decrypt_last(chunk).map_err(|_| "decryption failed")
        } else {
            let stream = self.inner.as_mut().ok_or("stream already finished")?;
            stream.decrypt_next(chunk).map_err(|_| "decryption failed")
        }
    }
}

#[wasm_bindgen]
impl StreamDecryptor {
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u8]) -> Result<StreamDecryptor, JsValue> {
        let cipher = stream_cipher(key)?;
        Ok(StreamDecryptor {
            inner: Some(DecryptorBE32::from_aead(cipher, &Default::default())),
        })
    }

    pub fn push(&mut self, chunk: &[u8], is_last: bool) -> Result<Vec<u8>, JsValue> {
        self.push_inner(chunk, is_last).map_err(JsValue::from_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_key_is_deterministic_and_salt_dependent() {
        let first = derive_key("correct horse", b"saltsaltsalt1234").unwrap();
        let again = derive_key("correct horse", b"saltsaltsalt1234").unwrap();
        let other = derive_key("correct horse", b"different-salt!!").unwrap();
        let wrong = derive_key("wrong horse", b"saltsaltsalt1234").unwrap();
        assert_eq!(first.len(), 32);
        assert_eq!(first, again);
        assert_ne!(first, other);
        assert_ne!(first, wrong);
    }

    #[test]
    fn stream_round_trips_across_chunks() {
        let key = [7u8; 32];
        let mut enc = StreamEncryptor::new(&key).unwrap();
        let c1 = enc.push_inner(b"the first slice", false).unwrap();
        let c2 = enc.push_inner(b"the second slice", false).unwrap();
        let c3 = enc.push_inner(b"final", true).unwrap();
        assert_eq!(c1.len(), b"the first slice".len() + 16);

        let mut dec = StreamDecryptor::new(&key).unwrap();
        assert_eq!(
            dec.push_inner(&c1, false).unwrap().as_slice(),
            b"the first slice"
        );
        assert_eq!(
            dec.push_inner(&c2, false).unwrap().as_slice(),
            b"the second slice"
        );
        assert_eq!(dec.push_inner(&c3, true).unwrap().as_slice(), b"final");
    }

    #[test]
    fn stream_rejects_reordered_chunks() {
        let key = [9u8; 32];
        let mut enc = StreamEncryptor::new(&key).unwrap();
        let _c1 = enc.push_inner(b"alpha", false).unwrap();
        let c2 = enc.push_inner(b"bravo", false).unwrap();
        let _c3 = enc.push_inner(b"charlie", true).unwrap();

        let mut dec = StreamDecryptor::new(&key).unwrap();
        assert!(dec.push_inner(&c2, false).is_err());
    }

    #[test]
    fn stream_rejects_truncation() {
        let key = [5u8; 32];
        let mut enc = StreamEncryptor::new(&key).unwrap();
        let c1 = enc.push_inner(b"head", false).unwrap();
        let _c2 = enc.push_inner(b"tail", true).unwrap();

        let mut dec = StreamDecryptor::new(&key).unwrap();
        assert!(dec.push_inner(&c1, true).is_err());
    }

    #[test]
    fn stream_rejects_wrong_key() {
        let mut enc = StreamEncryptor::new(&[1u8; 32]).unwrap();
        let sealed = enc.push_inner(b"secret", true).unwrap();

        let mut dec = StreamDecryptor::new(&[2u8; 32]).unwrap();
        assert!(dec.push_inner(&sealed, true).is_err());
    }
}
