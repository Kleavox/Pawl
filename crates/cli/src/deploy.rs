use std::collections::BTreeMap;
use std::path::Path;
use std::{env, fs};

use crate::client::{self, Registration};
use crate::d1::{self, capture, find, scratch, wrangler};
use crate::render::{self, CLIENT_ID, Production, WORKER};
use crate::{admin, keygen, root};

const REQUIRED: [&str; 4] = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "ROOT_DOMAIN",
    "ADMIN_EMAIL",
];

pub const OUTSIDE: [&str; 6] = [
    "RESEND_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
];

pub const MADE: [&str; 4] = [
    "OIDC_SIGNING_KEY",
    "OIDC_SUB_SECRET",
    "IP_HASH_SECRET",
    "OIDC_CLIENT_SECRET",
];

pub fn missing_settings(get: impl Fn(&str) -> Option<String>) -> Vec<&'static str> {
    REQUIRED
        .iter()
        .chain(OUTSIDE.iter())
        .copied()
        .filter(|name| get(name).is_none_or(|value| value.trim().is_empty()))
        .collect()
}

pub fn held_secrets(listed: Result<String, String>) -> Result<Vec<String>, String> {
    let text = match listed {
        Ok(text) => text,
        Err(error)
            if error.contains("10007")
                || error.to_lowercase().contains("does not exist")
                || error.contains(&format!("Worker \"{WORKER}\" not found")) =>
        {
            return Ok(Vec::new());
        }
        Err(error) => return Err(error),
    };
    let start = text.find('[').unwrap_or(0);
    let parsed: serde_json::Value = serde_json::from_str(&text[start..])
        .map_err(|_| format!("Could not read the Worker's secret names:\n{text}"))?;
    Ok(parsed
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry["name"].as_str().map(str::to_owned))
        .collect())
}

pub fn to_make(held: &[String]) -> Vec<&'static str> {
    MADE.iter()
        .copied()
        .filter(|name| !held.iter().any(|held| held == name))
        .collect()
}

fn make(name: &str) -> String {
    if name == "OIDC_SIGNING_KEY" {
        keygen::generate().signing_key
    } else {
        keygen::secret()
    }
}

fn redirect_uris(root_domain: &str) -> Vec<String> {
    vec![format!("https://{root_domain}/auth/callback")]
}

pub fn cabinet_client(root_domain: &str, secret: &str) -> Result<String, String> {
    let insert = client::prepare(
        &Registration {
            id: CLIENT_ID.into(),
            name: "Cabinet".into(),
            redirect_uris: redirect_uris(root_domain),
            first_party: true,
            confidential: true,
            scopes: vec!["openid".into(), "email".into(), "profile".into()],
            sector: None,
        },
        Some(secret),
    )?;
    Ok(format!(
        "{insert} ON CONFLICT(id) DO UPDATE SET secret_hash = excluded.secret_hash, redirect_uris = excluded.redirect_uris"
    ))
}

pub fn cabinet_redirect(root_domain: &str) -> Result<String, String> {
    let uris =
        serde_json::to_string(&redirect_uris(root_domain)).map_err(|error| error.to_string())?;
    Ok(format!(
        "UPDATE oauth_clients SET redirect_uris = '{}' WHERE id = '{CLIENT_ID}'",
        uris.replace('\'', "''")
    ))
}

fn status(args: &[&str]) -> Result<(), String> {
    let status = wrangler()
        .args(args)
        .status()
        .map_err(|error| format!("could not run wrangler: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("wrangler {} exited with {status}.", args.join(" ")))
    }
}

fn found_or_created(
    list: &[&str],
    create: &[&str],
    key: &str,
    id: &str,
    what: &str,
) -> Result<String, String> {
    if let Some(found) = find(&capture(list)?, key, WORKER, id)? {
        println!("Using the existing {what} {WORKER}.");
        return Ok(found);
    }
    println!("Creating the {what} {WORKER}.");
    capture(create)?;
    find(&capture(list)?, key, WORKER, id)?
        .ok_or_else(|| format!("The {what} {WORKER} was created but cannot be found."))
}

fn write_private(file: &Path, contents: &str) -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut handle = options
        .open(file)
        .map_err(|error| format!("{}: {error}", file.display()))?;
    std::io::Write::write_all(&mut handle, contents.as_bytes()).map_err(|error| error.to_string())
}

fn refusal(account: Option<&serde_json::Value>) -> Option<&'static str> {
    let Some(account) = account else {
        return Some(
            "ADMIN_EMAIL has no account yet. Sign up with it, verify it, then deploy again.",
        );
    };
    if account["role"] == "ADMIN" {
        return Some("The account in ADMIN_EMAIL is already an admin.");
    }
    if account["email_verified_at"].is_null() {
        return Some(
            "The address in ADMIN_EMAIL is not verified yet; verify it, then deploy again. Nobody was promoted.",
        );
    }
    None
}

fn promotion(email: &str) -> String {
    format!(
        "UPDATE users SET role='ADMIN', updated_at=datetime('now') WHERE email='{email}' AND email_verified_at IS NOT NULL"
    )
}

fn promote_admin(email: &str) -> String {
    let email = email.trim().to_lowercase();
    if !admin::safe_email(&email) {
        return "ADMIN_EMAIL is not a usable address; nobody was promoted.".into();
    }
    let Ok(rows) = d1::query(
        &format!("SELECT role, email_verified_at FROM users WHERE email = '{email}'"),
        false,
    ) else {
        return "Could not look up the account in ADMIN_EMAIL; nobody was promoted.".into();
    };
    if let Some(message) = refusal(rows.first()) {
        return message.into();
    }
    if d1::run(&promotion(&email), false).is_err() {
        return "Could not promote the account in ADMIN_EMAIL.".into();
    }
    "Promoted the account in ADMIN_EMAIL to admin.".into()
}

fn setting(name: &str) -> String {
    env::var(name).unwrap_or_default().trim().to_owned()
}

pub fn run() -> Result<(), String> {
    let missing = missing_settings(|name| env::var(name).ok());
    if !missing.is_empty() {
        return Err(format!(
            "Missing deployment settings: {}.\nSet them in GitHub: Settings → Secrets and variables → Actions.",
            missing.join(", ")
        ));
    }
    let root_dir = root();
    let root_domain = render::domain(&setting("ROOT_DOMAIN"))?;
    let admin_email = setting("ADMIN_EMAIL").to_lowercase();
    if !admin::safe_email(&admin_email) {
        return Err("ADMIN_EMAIL must be a plain address such as you@example.com.".into());
    }

    let d1_id = found_or_created(
        &["d1", "list", "--json"],
        &["d1", "create", WORKER],
        "name",
        "uuid",
        "D1 database",
    )?;
    let kv_id = found_or_created(
        &["kv", "namespace", "list"],
        &["kv", "namespace", "create", WORKER],
        "title",
        "id",
        "KV namespace",
    )?;

    let config = render::production(&Production {
        account_id: &setting("CLOUDFLARE_ACCOUNT_ID"),
        root_domain: &root_domain,
        manifest: &setting("ESTATE_MANIFEST"),
        d1_id: &d1_id,
        kv_id: &kv_id,
        compatibility_date: &render::compatibility_date(&root_dir)?,
    })?;
    let out = root_dir.join(".wrangler/deploy");
    fs::create_dir_all(&out).map_err(|error| format!("{}: {error}", out.display()))?;
    let config_file = out.join("pawl.json");
    fs::write(&config_file, format!("{config:#}\n")).map_err(|error| error.to_string())?;
    let config_path = config_file.to_string_lossy().into_owned();

    status(&[
        "d1",
        "migrations",
        "apply",
        "DB",
        "--remote",
        "--config",
        &config_path,
    ])?;

    let held = held_secrets(capture(&[
        "secret", "list", "--name", WORKER, "--format", "json",
    ]))?;
    let made: BTreeMap<&str, String> = to_make(&held)
        .into_iter()
        .map(|name| (name, make(name)))
        .collect();
    match made.get("OIDC_CLIENT_SECRET") {
        Some(secret) => d1::run(&cabinet_client(&root_domain, secret)?, false)?,
        None => d1::run(&cabinet_redirect(&root_domain)?, false)?,
    }

    let mut secrets: BTreeMap<String, String> = OUTSIDE
        .iter()
        .map(|name| ((*name).to_owned(), setting(name)))
        .collect();
    let previous = setting("OIDC_PREVIOUS_SIGNING_KEY");
    if !previous.is_empty() {
        secrets.insert("OIDC_PREVIOUS_SIGNING_KEY".into(), previous);
    }
    for (name, value) in &made {
        secrets.insert((*name).to_owned(), value.clone());
    }
    let dir = scratch("secrets")?;
    let secrets_file = dir.0.join("secrets.json");
    write_private(
        &secrets_file,
        &serde_json::to_string(&secrets).map_err(|error| error.to_string())?,
    )?;
    status(&[
        "deploy",
        "--strict",
        "--config",
        &config_path,
        "--secrets-file",
        &secrets_file.to_string_lossy(),
    ])?;
    drop(dir);

    if made.is_empty() {
        println!("The Worker already held every secret Pawl makes; none was replaced.");
    } else {
        println!(
            "Made and stored the secrets the Worker did not hold: {}.",
            made.keys().copied().collect::<Vec<_>>().join(", ")
        );
    }
    println!("{}", promote_admin(&admin_email));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_every_missing_setting_at_once() {
        let set = ["CLOUDFLARE_API_TOKEN", "ROOT_DOMAIN", "RESEND_API_KEY"];
        let missing = missing_settings(|name| set.contains(&name).then(|| "value".to_owned()));
        assert!(missing.contains(&"CLOUDFLARE_ACCOUNT_ID"));
        assert!(missing.contains(&"TURNSTILE_SECRET_KEY"));
        assert!(!missing.contains(&"ROOT_DOMAIN"));
        assert!(!missing.contains(&"ESTATE_MANIFEST"));
        assert!(missing.contains(&"ADMIN_EMAIL"));
        assert!(missing_settings(|_| Some("  ".into())).contains(&"ROOT_DOMAIN"));
    }

    #[test]
    fn makes_only_what_the_worker_does_not_hold() {
        assert_eq!(to_make(&[]), MADE.to_vec());
        let held = vec!["OIDC_SIGNING_KEY".to_owned(), "RESEND_API_KEY".to_owned()];
        assert_eq!(
            to_make(&held),
            ["OIDC_SUB_SECRET", "IP_HASH_SECRET", "OIDC_CLIENT_SECRET"]
        );
        let all: Vec<String> = MADE.iter().map(|name| (*name).to_owned()).collect();
        assert!(to_make(&all).is_empty());
    }

    #[test]
    fn reads_the_secret_names_a_worker_holds_and_treats_a_missing_worker_as_none() {
        let listed = r#"[{"name":"OIDC_SIGNING_KEY","type":"secret_text"}]"#;
        assert_eq!(
            held_secrets(Ok(listed.into())).unwrap(),
            ["OIDC_SIGNING_KEY"]
        );
        assert!(
            held_secrets(Err(
                "This Worker does not exist on your account. [code: 10007]".into()
            ))
            .unwrap()
            .is_empty()
        );
        assert!(
            held_secrets(Err(
                "wrangler secret exited with exit status: 1:\n✘ [ERROR] Worker \"pawl\" not found.\n  If this is a new Worker, run `wrangler deploy` first to create it.".into()
            ))
            .unwrap()
            .is_empty()
        );
        assert!(held_secrets(Err("Authentication error [code: 10000]".into())).is_err());
        assert!(held_secrets(Err("Account \"x\" not found.".into())).is_err());
    }

    #[test]
    fn registers_the_cabinet_with_the_hash_of_its_secret_and_survives_a_rerun() {
        let sql = cabinet_client("product.test", "the-secret").unwrap();
        assert!(sql.starts_with("INSERT INTO oauth_clients"));
        assert!(sql.contains(&client::hash("the-secret")));
        assert!(!sql.contains("the-secret"));
        assert!(sql.contains("https://product.test/auth/callback"));
        assert!(sql.ends_with(
            "ON CONFLICT(id) DO UPDATE SET secret_hash = excluded.secret_hash, redirect_uris = excluded.redirect_uris"
        ));
    }

    #[test]
    fn keeps_the_cabinets_redirect_in_step_with_the_domain() {
        assert_eq!(
            cabinet_redirect("product.test").unwrap(),
            r#"UPDATE oauth_clients SET redirect_uris = '["https://product.test/auth/callback"]' WHERE id = 'gateway'"#
        );
    }

    #[test]
    fn promotes_only_an_account_whose_address_is_verified() {
        let unverified = serde_json::json!({ "role": "USER", "email_verified_at": null });
        assert!(refusal(Some(&unverified)).unwrap().contains("not verified"));
        let verified = serde_json::json!({ "role": "USER", "email_verified_at": "2026-10-12" });
        assert_eq!(refusal(Some(&verified)), None);
        let admin = serde_json::json!({ "role": "ADMIN", "email_verified_at": "2026-10-12" });
        assert!(refusal(Some(&admin)).unwrap().contains("already"));
        assert!(refusal(None).unwrap().contains("no account"));
        assert!(promotion("a@example.com").ends_with("AND email_verified_at IS NOT NULL"));
    }

    #[test]
    fn makes_a_signing_key_the_provider_can_read_and_fresh_secrets_otherwise() {
        assert!(oidc::public_jwk(&make("OIDC_SIGNING_KEY")).is_ok());
        assert_ne!(make("OIDC_SUB_SECRET"), make("OIDC_SUB_SECRET"));
    }
}
