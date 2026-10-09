use registry::Registry;

fn validated(json: &str) -> Result<(Vec<(String, String)>, serde_json::Value), String> {
    let placements = Registry::new(json)
        .map_err(|problems| problems.join("\n"))?
        .placements();
    let manifest = serde_json::from_str(json).map_err(|error| error.to_string())?;
    Ok((placements, manifest))
}

pub fn check(json: &str) -> Result<String, String> {
    let (placements, manifest) = validated(json)?;
    let apps = manifest["apps"].as_array().cloned().unwrap_or_default();
    Ok(placements
        .iter()
        .map(|(key, code)| {
            let label = apps
                .iter()
                .find(|app| app["key"] == key.as_str())
                .and_then(|app| app["label"].as_str())
                .unwrap_or_default();
            format!("bay {code}  {key}  {}", label.to_ascii_uppercase())
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

pub fn pin(json: &str) -> Result<String, String> {
    let (placements, mut manifest) = validated(json)?;
    let apps = manifest
        .get_mut("apps")
        .and_then(serde_json::Value::as_array_mut);
    for app in apps
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_object_mut)
    {
        if app.contains_key("bay") {
            continue;
        }
        let key = app
            .get("key")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if let Some((_, code)) = placements.iter().find(|(placed, _)| *placed == key) {
            app.insert("bay".to_owned(), serde_json::Value::String(code.clone()));
        }
    }
    serde_json::to_string_pretty(&manifest)
        .map(|text| format!("{text}\n"))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWNER: &str = r#"{
  "site": { "name": "Example" },
  "apps": [
    { "key": "notes", "label": "note", "title": "Notes", "subdomain": "notes", "service": "notes" },
    { "key": "docs", "label": "manual", "title": "Docs", "subdomain": "docs", "service": "docs" }
  ]
}
"#;

    fn parsed(text: &str) -> serde_json::Value {
        serde_json::from_str(text).expect("json")
    }

    #[test]
    fn pins_each_placed_app_to_the_bay_it_already_occupies() {
        let value = parsed(&pin(OWNER).expect("valid"));
        assert_eq!(value["apps"][0]["bay"], "2");
        assert_eq!(value["apps"][1]["bay"], "7");
    }

    #[test]
    fn changes_nothing_but_the_bay_fields() {
        let value = parsed(&pin(OWNER).expect("valid"));
        let keys: Vec<&str> = value["apps"][0]
            .as_object()
            .expect("object")
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            ["key", "label", "title", "subdomain", "service", "bay"]
        );
        let mut unpinned = value.clone();
        for app in unpinned["apps"].as_array_mut().expect("apps") {
            app.as_object_mut().expect("object").remove("bay");
        }
        assert_eq!(unpinned, parsed(OWNER));
    }

    #[test]
    fn adds_no_key_the_owner_did_not_write() {
        let bare = r#"{ "site": { "name": "Example" } }"#;
        assert_eq!(parsed(&pin(bare).expect("valid")), parsed(bare));
    }

    #[test]
    fn leaves_an_existing_pin_where_it_is() {
        let held = OWNER.replace(r#""key": "docs","#, r#""key": "docs", "bay": "5","#);
        assert_eq!(parsed(&pin(&held).expect("valid"))["apps"][1]["bay"], "5");
    }

    #[test]
    fn is_idempotent() {
        let once = pin(OWNER).expect("valid");
        assert_eq!(pin(&once).expect("valid"), once);
    }

    #[test]
    fn refuses_an_invalid_manifest_with_its_problems() {
        assert!(
            pin(r#"{ "site": { "name": "" } }"#)
                .expect_err("refused")
                .contains("site name")
        );
    }

    #[test]
    fn reports_where_each_app_sits() {
        assert_eq!(
            check(OWNER).expect("valid"),
            "bay 2  notes  NOTE\nbay 7  docs  MANUAL"
        );
    }
}
