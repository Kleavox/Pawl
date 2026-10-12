use std::fs;
use std::path::Path;

pub const ACCOUNT_APP: &str = "/pass";

fn rule(path: &str, headers: &[String]) -> String {
    let mut text = if path.starts_with('/') {
        format!("{ACCOUNT_APP}{path}\n")
    } else {
        format!("{path}\n")
    };
    let mut names: Vec<&str> = Vec::new();
    for header in headers {
        if let Some((name, _)) = header.split_once(':') {
            let name = name.trim();
            if !name.starts_with('!') && !names.contains(&name) {
                names.push(name);
            }
        }
    }
    for name in names {
        text.push_str(&format!("  ! {name}\n"));
    }
    for header in headers {
        text.push_str(&format!("  {header}\n"));
    }
    text
}

pub fn merge_headers(cabinet: &str, account: &str) -> String {
    let mut rules: Vec<(String, Vec<String>)> = Vec::new();
    for line in account.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if line.starts_with(char::is_whitespace) {
            if let Some((_, headers)) = rules.last_mut() {
                headers.push(trimmed.to_owned());
            }
        } else {
            rules.push((trimmed.to_owned(), Vec::new()));
        }
    }
    let mut merged = cabinet.trim_end().to_owned();
    for (path, headers) in &rules {
        merged.push_str("\n\n");
        merged.push_str(rule(path, headers).trim_end());
    }
    merged.push('\n');
    merged
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|error| format!("{}: {error}", to.display()))?;
    for entry in fs::read_dir(from).map_err(|error| format!("{}: {error}", from.display()))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = to.join(entry.file_name());
        if entry.file_name() == "_headers" {
            continue;
        }
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)
                .map_err(|error| format!("{}: {error}", target.display()))?;
        }
    }
    Ok(())
}

fn read_headers(dir: &Path) -> Result<String, String> {
    let file = dir.join("_headers");
    if file.is_file() {
        fs::read_to_string(&file).map_err(|error| format!("{}: {error}", file.display()))
    } else {
        Ok(String::new())
    }
}

pub fn assemble(root: &Path) -> Result<String, String> {
    let cabinet = root.join("apps/web/dist");
    let account = root.join("apps/pass/dist");
    for dir in [&cabinet, &account] {
        if !dir.join("index.html").is_file() {
            return Err(format!(
                "{} has no index.html. Build the apps first (pnpm build).",
                dir.display()
            ));
        }
    }
    let nested = &ACCOUNT_APP[1..];
    if cabinet.join(nested).exists() {
        return Err(format!(
            "The cabinet's build has its own {ACCOUNT_APP}/, where the account app goes."
        ));
    }
    let out = root.join("worker/assets");
    if out.exists() {
        fs::remove_dir_all(&out).map_err(|error| format!("{}: {error}", out.display()))?;
    }
    copy_dir(&cabinet, &out)?;
    copy_dir(&account, &out.join(nested))?;
    fs::write(
        out.join("_headers"),
        merge_headers(&read_headers(&cabinet)?, &read_headers(&account)?),
    )
    .map_err(|error| error.to_string())?;
    Ok(format!(
        "Assembled worker/assets: the cabinet at /, the account app at {ACCOUNT_APP}/."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CABINET: &str =
        "/*\n  Content-Security-Policy: default-src 'self'\n  X-Frame-Options: DENY\n";
    const ACCOUNT: &str = "/*\n  Content-Security-Policy: default-src 'self'; frame-src https://challenges.cloudflare.com\n";

    #[test]
    fn keeps_the_cabinets_rules_as_they_are() {
        let merged = merge_headers(CABINET, ACCOUNT);
        assert!(merged.starts_with(CABINET.trim_end()));
    }

    #[test]
    fn moves_the_account_apps_rules_under_its_path_and_replaces_what_they_set() {
        let merged = merge_headers(CABINET, ACCOUNT);
        let account = merged.split("\n\n").nth(1).unwrap();
        assert_eq!(
            account,
            "/pass/*\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'self'; frame-src https://challenges.cloudflare.com\n"
        );
    }

    #[test]
    fn unsets_each_header_once_and_leaves_an_unset_it_was_given_alone() {
        let merged = merge_headers("", "/a\n  Link: </x>\n  Link: </y>\n  ! X-Robots-Tag\n");
        assert_eq!(
            merged.trim_start(),
            "/pass/a\n  ! Link\n  Link: </x>\n  Link: </y>\n  ! X-Robots-Tag\n"
        );
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let merged = merge_headers("", "# account\n\n/*\n  X-Test: 1\n");
        assert_eq!(merged.trim_start(), "/pass/*\n  ! X-Test\n  X-Test: 1\n");
    }

    #[test]
    fn assembles_both_builds_into_one_directory() {
        let root = std::env::temp_dir().join(format!("pawl-assets-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for (dir, body) in [("apps/web/dist", "cabinet"), ("apps/pass/dist", "account")] {
            fs::create_dir_all(root.join(dir).join("assets")).unwrap();
            fs::write(root.join(dir).join("index.html"), body).unwrap();
            fs::write(root.join(dir).join("assets/app.js"), body).unwrap();
        }
        fs::write(root.join("apps/web/dist/_headers"), CABINET).unwrap();
        fs::write(root.join("apps/pass/dist/_headers"), ACCOUNT).unwrap();

        assemble(&root).unwrap();
        let out = root.join("worker/assets");
        assert_eq!(
            fs::read_to_string(out.join("index.html")).unwrap(),
            "cabinet"
        );
        assert_eq!(
            fs::read_to_string(out.join("pass/assets/app.js")).unwrap(),
            "account"
        );
        assert!(!out.join("pass/_headers").exists());
        assert!(
            fs::read_to_string(out.join("_headers"))
                .unwrap()
                .contains("/pass/*")
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn refuses_before_the_apps_are_built() {
        let root = std::env::temp_dir().join(format!("pawl-unbuilt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        assert!(assemble(&root).unwrap_err().contains("pnpm build"));
    }
}
