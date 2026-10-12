use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::{env, fs};

use crate::render::{WORKER, compatibility_date};
use crate::root;

pub struct Scratch(pub PathBuf);

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn scratch(label: &str) -> Result<Scratch, String> {
    let dir = Scratch(env::temp_dir().join(format!("pawl-{label}-{}", std::process::id())));
    fs::create_dir_all(&dir.0).map_err(|error| error.to_string())?;
    Ok(dir)
}

pub fn wrangler() -> Command {
    let mut command = Command::new(if cfg!(windows) { "pnpm.cmd" } else { "pnpm" });
    command.current_dir(root()).args(["exec", "wrangler"]);
    command
}

pub fn capture(args: &[&str]) -> Result<String, String> {
    let output = wrangler()
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("could not run wrangler: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!(
            "wrangler {} exited with {}:\n{}{stdout}",
            args.first().copied().unwrap_or_default(),
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

fn json_part(text: &str) -> &str {
    let start = text.find(['[', '{']).unwrap_or(0);
    &text[start..]
}

pub fn find(list: &str, key: &str, wanted: &str, id: &str) -> Result<Option<String>, String> {
    let parsed: serde_json::Value = serde_json::from_str(json_part(list))
        .map_err(|_| format!("Could not read wrangler's list:\n{list}"))?;
    Ok(parsed
        .as_array()
        .into_iter()
        .flatten()
        .find(|entry| entry[key] == wanted)
        .and_then(|entry| entry[id].as_str().map(str::to_owned)))
}

pub fn database_id() -> Result<Option<String>, String> {
    find(&capture(&["d1", "list", "--json"])?, "name", WORKER, "uuid")
}

fn config(local: bool, scratch: &Scratch) -> Result<PathBuf, String> {
    let root = root();
    if local {
        return Ok(root.join("worker/wrangler.jsonc"));
    }
    let id = database_id()?.ok_or(
        "There is no D1 database named pawl in this Cloudflare account yet. Deploy once first.",
    )?;
    let body = serde_json::json!({
        "name": WORKER,
        "compatibility_date": compatibility_date(&root)?,
        "d1_databases": [{ "binding": "DB", "database_name": WORKER, "database_id": id }],
    });
    let path = scratch.0.join("pawl.json");
    fs::write(&path, body.to_string()).map_err(|error| error.to_string())?;
    Ok(path)
}

fn execute(local: bool, scratch: &Scratch) -> Result<Command, String> {
    let config = config(local, scratch)?;
    let mut command = wrangler();
    command
        .args([
            "d1",
            "execute",
            "DB",
            if local { "--local" } else { "--remote" },
            "--config",
        ])
        .arg(config);
    Ok(command)
}

pub fn run(sql: &str, local: bool) -> Result<(), String> {
    let dir = scratch("d1")?;
    let file = dir.0.join("statement.sql");
    fs::write(&file, sql).map_err(|error| error.to_string())?;
    let status = execute(local, &dir)?
        .arg("--file")
        .arg(&file)
        .status()
        .map_err(|error| format!("could not run wrangler: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("wrangler exited with {status}."))
    }
}

pub fn query(sql: &str, local: bool) -> Result<Vec<serde_json::Value>, String> {
    let dir = scratch("d1")?;
    let output = execute(local, &dir)?
        .args(["--json", "--command", sql])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("could not run wrangler: {error}"))?;
    if !output.status.success() {
        eprint!("{}", String::from_utf8_lossy(&output.stderr));
        return Err(format!("wrangler exited with {}.", output.status));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(json_part(&stdout))
        .map_err(|_| format!("Could not parse wrangler output:\n{stdout}"))?;
    let first = if parsed.is_array() {
        parsed[0].clone()
    } else {
        parsed
    };
    Ok(first["results"].as_array().cloned().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_resource_by_name_in_a_wrangler_list() {
        let d1 = r#"[{"uuid":"a","name":"other"},{"uuid":"b","name":"pawl"}]"#;
        assert_eq!(
            find(d1, "name", "pawl", "uuid").unwrap().as_deref(),
            Some("b")
        );
        let kv = "Listing namespaces\n[{\"id\":\"k1\",\"title\":\"pawl\"}]";
        assert_eq!(
            find(kv, "title", "pawl", "id").unwrap().as_deref(),
            Some("k1")
        );
        assert_eq!(find("[]", "name", "pawl", "uuid").unwrap(), None);
        assert!(find("not json", "name", "pawl", "uuid").is_err());
    }
}
