use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::{env, fs};

struct Scratch(PathBuf);

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn required(name: &str) -> Result<String, String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!("Missing environment variable {name} (required for --remote). Set WORKER_PREFIX and PASS_D1_ID, or use --local.")
        })
}

fn compatibility_date() -> Result<String, String> {
    let config = fs::read_to_string("workers/pass/wrangler.jsonc")
        .map_err(|error| format!("workers/pass/wrangler.jsonc: {error}"))?;
    let start = config
        .find("\"compatibility_date\"")
        .ok_or("workers/pass/wrangler.jsonc names no compatibility_date")?;
    config[start..]
        .split('"')
        .nth(3)
        .map(str::to_owned)
        .ok_or_else(|| {
            "workers/pass/wrangler.jsonc has an unreadable compatibility_date".to_owned()
        })
}

fn scratch() -> Result<Scratch, String> {
    let dir = Scratch(env::temp_dir().join(format!("pass-d1-{}", std::process::id())));
    fs::create_dir_all(&dir.0).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn wrangler(local: bool, scratch: &Scratch) -> Result<Command, String> {
    let config = if local {
        PathBuf::from("workers/pass/wrangler.jsonc")
    } else {
        let name = format!("{}-pass", required("WORKER_PREFIX")?);
        let body = serde_json::json!({
            "name": name,
            "compatibility_date": compatibility_date()?,
            "d1_databases": [{ "binding": "DB", "database_name": name, "database_id": required("PASS_D1_ID")? }],
        });
        let path = scratch.0.join("pass.json");
        fs::write(&path, body.to_string()).map_err(|error| error.to_string())?;
        path
    };
    let mut command = Command::new(if cfg!(windows) { "pnpm.cmd" } else { "pnpm" });
    command
        .args([
            "exec",
            "wrangler",
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
    let dir = scratch()?;
    let file = dir.0.join("statement.sql");
    fs::write(&file, sql).map_err(|error| error.to_string())?;
    let status = wrangler(local, &dir)?
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
    let dir = scratch()?;
    let output = wrangler(local, &dir)?
        .args(["--json", "--command", sql])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("could not run wrangler: {error}"))?;
    if !output.status.success() {
        eprint!("{}", String::from_utf8_lossy(&output.stderr));
        return Err(format!("wrangler exited with {}.", output.status));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|_| format!("Could not parse wrangler output:\n{stdout}"))?;
    let first = if parsed.is_array() {
        parsed[0].clone()
    } else {
        parsed
    };
    Ok(first["results"].as_array().cloned().unwrap_or_default())
}
