use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

pub struct Registration {
    pub id: String,
    pub name: String,
    pub redirect_uris: Vec<String>,
    pub first_party: bool,
    pub confidential: bool,
    pub scopes: Vec<String>,
    pub sector: Option<String>,
}

const OFFERED_SCOPES: [&str; 3] = ["openid", "email", "profile"];
const LOOPBACK: [&str; 3] = ["127.0.0.1", "localhost", "[::1]"];

fn quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn hash(secret: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(secret.as_bytes()))
}

fn slug(id: &str) -> bool {
    let bytes = id.as_bytes();
    (3..=64).contains(&bytes.len())
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
        && bytes[0] != b'-'
        && bytes[bytes.len() - 1] != b'-'
}

fn authority(uri: &str) -> Result<String, String> {
    let not_a_url = || format!("Redirect URI is not a URL: {uri}");
    if uri
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(not_a_url());
    }
    let (scheme, rest) = uri.split_once("://").ok_or_else(not_a_url)?;
    if uri.contains('*') {
        return Err(format!("Redirect URI may not contain a wildcard: {uri}"));
    }
    if uri.contains('#') {
        return Err(format!("Redirect URI may not carry a fragment: {uri}"));
    }
    let authority = rest.split(['/', '?']).next().unwrap_or_default();
    if authority.is_empty() {
        return Err(not_a_url());
    }
    let host = match authority.find(']') {
        Some(end) if authority.starts_with('[') => &authority[..=end],
        _ => authority.split(':').next().unwrap_or_default(),
    };
    match scheme.to_ascii_lowercase().as_str() {
        "https" => Ok(authority.to_owned()),
        "http" if LOOPBACK.contains(&host) => Ok(authority.to_owned()),
        _ => Err(format!("Redirect URI must be https: {uri}")),
    }
}

pub fn prepare(input: &Registration, secret: Option<&str>) -> Result<String, String> {
    if !slug(&input.id) {
        return Err(format!("Client id must be a lowercase slug: {}", input.id));
    }
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Client name must be 1 to 64 printable characters.".into());
    }
    if input.redirect_uris.is_empty() {
        return Err("A client needs at least one redirect URI.".into());
    }
    let authorities = input
        .redirect_uris
        .iter()
        .map(|uri| authority(uri))
        .collect::<Result<Vec<_>, _>>()?;
    if !input.scopes.iter().any(|scope| scope == "openid") {
        return Err("A client must ask for the openid scope.".into());
    }
    let unknown: Vec<&str> = input
        .scopes
        .iter()
        .map(String::as_str)
        .filter(|scope| !OFFERED_SCOPES.contains(scope))
        .collect();
    if !unknown.is_empty() {
        return Err(format!("Pawl offers no such scope: {}", unknown.join(", ")));
    }
    match (input.confidential, secret) {
        (true, None) => return Err("A confidential client needs a secret.".into()),
        (false, Some(_)) => return Err("A public client must not be given a secret.".into()),
        _ => {}
    }
    let sector = input
        .sector
        .clone()
        .unwrap_or_else(|| authorities[0].clone());
    let values = [
        quoted(&input.id),
        quoted(name),
        quoted(&serde_json::to_string(&input.redirect_uris).map_err(|error| error.to_string())?),
        quoted(&serde_json::to_string(&input.scopes).map_err(|error| error.to_string())?),
        u8::from(input.confidential).to_string(),
        u8::from(input.first_party).to_string(),
        secret.map_or_else(|| "NULL".to_owned(), |secret| quoted(&hash(secret))),
        quoted(&sector),
        "datetime('now')".to_owned(),
    ];
    Ok(format!(
        "INSERT INTO oauth_clients (id, name, redirect_uris, allowed_scopes, confidential, first_party, secret_hash, sector, approved_at) VALUES ({})",
        values.join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn access() -> Registration {
        Registration {
            id: "krynodes-access".into(),
            name: "Krynodes".into(),
            redirect_uris: vec!["https://team.cloudflareaccess.com/cdn-cgi/access/callback".into()],
            first_party: false,
            confidential: true,
            scopes: vec!["openid".into(), "email".into(), "profile".into()],
            sector: None,
        }
    }

    #[test]
    fn stores_the_hash_of_a_confidential_clients_secret_never_the_secret() {
        let sql = prepare(&access(), Some("the-secret")).expect("valid");
        assert!(sql.contains(&hash("the-secret")));
        assert!(!sql.contains("the-secret"));
    }

    #[test]
    fn derives_the_pairwise_sector_from_the_redirect_host() {
        assert!(
            prepare(&access(), Some("s"))
                .expect("valid")
                .contains("'team.cloudflareaccess.com'")
        );
    }

    #[test]
    fn registers_the_client_approved_and_with_its_flags() {
        let sql = prepare(&access(), Some("s")).expect("valid");
        assert!(sql.starts_with("INSERT INTO oauth_clients"));
        assert!(sql.contains(", 1, 0, "));
        assert!(sql.ends_with("datetime('now'))"));
    }

    #[test]
    fn escapes_a_quote_in_the_name_rather_than_ending_the_statement() {
        let mut named = access();
        named.name = "Owner's app".into();
        assert!(
            prepare(&named, Some("s"))
                .expect("valid")
                .contains("'Owner''s app'")
        );
    }

    #[test]
    fn keeps_a_quote_in_a_redirect_uri_inside_its_literal() {
        let mut quoted = access();
        quoted.redirect_uris = vec!["https://app.test/cb?next=it's".into()];
        assert!(
            prepare(&quoted, Some("s"))
                .expect("valid")
                .contains("it''s")
        );
    }

    #[test]
    fn refuses_a_confidential_client_with_no_secret() {
        assert!(prepare(&access(), None).is_err());
    }

    #[test]
    fn refuses_a_public_client_that_was_handed_a_secret() {
        let mut public = access();
        public.confidential = false;
        assert!(prepare(&public, Some("s")).is_err());
        assert!(
            prepare(&public, None)
                .expect("valid")
                .contains(", 0, 0, NULL, ")
        );
    }

    #[test]
    fn refuses_plain_http_except_on_the_loopback() {
        let mut plain = access();
        plain.redirect_uris = vec!["http://app.test/cb".into()];
        assert!(prepare(&plain, Some("s")).is_err());
        for loopback in [
            "http://127.0.0.1:8788/callback",
            "http://localhost/cb",
            "http://[::1]:9000/cb",
        ] {
            plain.redirect_uris = vec![loopback.into()];
            assert!(prepare(&plain, Some("s")).is_ok(), "{loopback}");
        }
    }

    #[test]
    fn refuses_a_wildcard_a_fragment_or_a_non_url() {
        for uri in [
            "https://*.app.test/cb",
            "https://app.test/cb#done",
            "not a url",
            "https:///cb",
        ] {
            let mut bad = access();
            bad.redirect_uris = vec![uri.into()];
            assert!(prepare(&bad, Some("s")).is_err(), "{uri}");
        }
    }

    #[test]
    fn refuses_a_scope_the_provider_does_not_offer_or_a_client_without_openid() {
        let mut extra = access();
        extra.scopes.push("admin".into());
        assert!(prepare(&extra, Some("s")).is_err());
        let mut bare = access();
        bare.scopes = vec!["email".into()];
        assert!(prepare(&bare, Some("s")).is_err());
    }

    #[test]
    fn refuses_an_id_that_is_not_a_plain_slug() {
        for id in ["x'; DROP", "-lead", "trail-", "UPPER", "ab"] {
            let mut odd = access();
            odd.id = id.into();
            assert!(prepare(&odd, Some("s")).is_err(), "{id}");
        }
    }
}
