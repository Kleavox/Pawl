use crate::d1;

fn made_of(text: &str, extra: &[u8]) -> bool {
    text.bytes()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || extra.contains(&byte))
}

pub fn safe_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    let Some((host, top)) = domain.rsplit_once('.') else {
        return false;
    };
    !local.is_empty()
        && made_of(local, b"._%+-")
        && !host.is_empty()
        && made_of(host, b".-")
        && top.len() >= 2
        && top.bytes().all(|byte| byte.is_ascii_lowercase())
}

fn print_admins(local: bool) -> Result<(), String> {
    let admins = d1::query(
        "SELECT email, role FROM users WHERE role='ADMIN' ORDER BY email",
        local,
    )?;
    if admins.is_empty() {
        println!("\nNo ADMIN accounts exist yet.");
        return Ok(());
    }
    println!("\nCurrent admins:");
    for admin in admins {
        println!("  {}", admin["email"].as_str().unwrap_or_default());
    }
    Ok(())
}

pub fn promote(email: Option<&str>, list: bool, local: bool) -> Result<(), String> {
    if list {
        return print_admins(local);
    }
    let raw = email
        .ok_or("Missing --email. Usage: pawl admin promote --email you@example.com [--local]")?;
    let email = raw.trim().to_lowercase();
    if !safe_email(&email) {
        return Err(format!(
            "Refusing to use an unsafe or malformed email: {raw}"
        ));
    }
    let accounts = d1::query(
        &format!("SELECT email, role, email_verified_at FROM users WHERE email = '{email}'"),
        local,
    )?;
    let account = accounts.first().ok_or_else(|| {
        format!("No account for {email}. Register and verify it in Pass first, then re-run.")
    })?;
    if account["role"] == "ADMIN" {
        println!("{email} is already an ADMIN. Nothing to do.");
        return print_admins(local);
    }
    d1::run(
        &format!("UPDATE users SET role='ADMIN', updated_at=datetime('now') WHERE email='{email}'"),
        local,
    )?;
    println!("\nPromoted {email} to ADMIN.");
    if account["email_verified_at"].is_null() {
        eprintln!(
            "\nWarning: this account's email is NOT verified. Verify the address in Pass\nbefore relying on it: an unverified address is not proof of who holds it."
        );
    }
    print_admins(local)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_an_ordinary_address_and_refuses_anything_that_could_end_a_literal() {
        assert!(safe_email("owner@example.test"));
        assert!(safe_email("o.w+n_er%1@mail.example.test"));
        for bad in [
            "o'wner@example.test",
            "owner@example.test' OR 1=1 --",
            "owner@example",
            "@example.test",
            "owner@.t",
            "Owner@example.test",
            "owner@exa mple.test",
            "owner@@example.test",
        ] {
            assert!(!safe_email(bad), "{bad}");
        }
    }
}
