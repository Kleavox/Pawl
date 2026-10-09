mod admin;
mod client;
mod d1;
mod keygen;
mod manifest;

use std::process::ExitCode;
use std::{env, fs};

const USAGE: &str = "usage:
  pawl keygen
  pawl manifest check <file>
  pawl manifest pin <file>
  pawl client register --id <slug> --name <name> --redirect-uri <uri> [--redirect-uri <uri> ...]
                       [--scope <scope> ...] [--first-party] [--public] [--sector <host>] [--local]
  pawl admin promote --email <address> [--local]
  pawl admin promote --list [--local]";

fn value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.iter()
        .position(|arg| arg == flag)
        .and_then(|index| args.get(index + 1))
        .map(String::as_str)
}

fn values(args: &[String], flag: &str) -> Vec<String> {
    args.windows(2)
        .filter(|pair| pair[0] == flag)
        .map(|pair| pair[1].clone())
        .collect()
}

fn has(args: &[String], flag: &str) -> bool {
    args.iter().any(|arg| arg == flag)
}

fn read(file: &str) -> Result<String, String> {
    fs::read_to_string(file).map_err(|error| format!("{file}: {error}"))
}

fn register(args: &[String], local: bool) -> Result<(), String> {
    let confidential = !has(args, "--public");
    let secret = confidential.then(keygen::secret);
    let scopes = values(args, "--scope");
    let registration = client::Registration {
        id: value(args, "--id").ok_or(USAGE)?.to_owned(),
        name: value(args, "--name").ok_or(USAGE)?.to_owned(),
        redirect_uris: values(args, "--redirect-uri"),
        first_party: has(args, "--first-party"),
        confidential,
        scopes: if scopes.is_empty() {
            vec!["openid".into(), "email".into(), "profile".into()]
        } else {
            scopes
        },
        sector: value(args, "--sector").map(str::to_owned),
    };
    d1::run(&client::prepare(&registration, secret.as_deref())?, local)?;
    println!("\nRegistered {}.", registration.id);
    if let Some(secret) = secret {
        println!(
            "\nIts client secret is below. It is shown once and Pawl keeps only its hash:\n\n  {secret}\n\nPut it where the client reads it, then clear this terminal."
        );
    }
    Ok(())
}

fn run(args: &[String]) -> Result<(), String> {
    let local = has(args, "--local");
    let words: Vec<&str> = args
        .iter()
        .map(String::as_str)
        .filter(|arg| *arg != "--")
        .collect();
    match words.as_slice() {
        ["keygen", ..] => {
            let generated = keygen::generate();
            let kid = oidc::public_jwk(&generated.signing_key)
                .map_err(|error| error.0)?
                .kid;
            println!(
                "OIDC_SIGNING_KEY={}\nOIDC_SUB_SECRET={}\nkid={kid}\n\nPut both values in GitHub (Settings → Secrets and variables → Actions → Secrets). Keep no other copy.",
                generated.signing_key, generated.sub_secret
            );
            Ok(())
        }
        ["manifest", "check", file, ..] => {
            println!("{}", manifest::check(&read(file)?)?);
            Ok(())
        }
        ["manifest", "pin", file, ..] => {
            fs::write(file, manifest::pin(&read(file)?)?)
                .map_err(|error| format!("{file}: {error}"))?;
            println!("{}", manifest::check(&read(file)?)?);
            Ok(())
        }
        ["client", "register", ..] => register(args, local),
        ["admin", "promote", ..] => {
            admin::promote(value(args, "--email"), has(args, "--list"), local)
        }
        _ => Err(USAGE.to_owned()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("\n{message}");
            ExitCode::FAILURE
        }
    }
}
