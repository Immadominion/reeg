use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::hash::ContentHash;

/// The manifest schema version. Bumped only for changes that alter the bytes of an existing
/// input (see manifest-spec.md section 6).
pub const SCHEMA_VERSION: u32 = 1;

/// The marker a secret value is replaced with, so a checkpoint never inlines a secret.
pub const REDACTED: &str = "<redacted>";

/// One installed package recorded in the environment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Package {
    pub name: String,
    pub version: String,
}

/// The inputs the runtime supplies about an environment, before they are canonicalized into
/// a manifest. Phase B passes these in directly; phase C fills them from the live runtime.
#[derive(Debug, Clone, Default)]
pub struct EnvironmentInputs {
    pub packages: Vec<Package>,
    pub env: BTreeMap<String, String>,
    pub tools: Vec<String>,
    pub memory_pointer: Option<String>,
}

/// The small, hashed-over summary of a checkpoint. Field order here is the canonical order;
/// `manifest_hash` is computed over the canonical JSON of exactly these fields and is what
/// the chain pins and the verifier recomputes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub schema_version: u32,
    pub packages: Vec<Package>,
    pub env: BTreeMap<String, String>,
    pub tools: Vec<String>,
    pub memory_pointer: Option<String>,
    pub workdir_root_hash: ContentHash,
}

impl Manifest {
    /// Build a manifest from runtime inputs and a captured working-directory root hash.
    /// Packages and tools are sorted and secret env values are redacted here, so the same
    /// logical environment always yields the same canonical bytes.
    pub fn new(inputs: EnvironmentInputs, workdir_root_hash: ContentHash) -> Self {
        let mut packages = inputs.packages;
        packages.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.version.cmp(&b.version)));

        let mut tools = inputs.tools;
        tools.sort();
        tools.dedup();

        let env = inputs
            .env
            .into_iter()
            .map(|(key, value)| {
                let value = if is_secret_key(&key) {
                    REDACTED.to_string()
                } else {
                    value
                };
                (key, value)
            })
            .collect();

        Manifest {
            schema_version: SCHEMA_VERSION,
            packages,
            env,
            tools,
            memory_pointer: inputs.memory_pointer,
            workdir_root_hash,
        }
    }

    /// The canonical bytes the manifest hash is taken over: compact JSON, fixed field order,
    /// sorted map keys, no floats.
    pub fn canonical_bytes(&self) -> Result<Vec<u8>> {
        Ok(serde_json::to_vec(self)?)
    }

    /// `BLAKE3(canonical_bytes)`. Stable for a given logical environment.
    pub fn manifest_hash(&self) -> Result<ContentHash> {
        Ok(ContentHash::of(&self.canonical_bytes()?))
    }
}

/// An env var is treated as a secret when its key contains a known sensitive token. We keep
/// the key (the environment's shape stays verifiable) and redact only the value.
fn is_secret_key(key: &str) -> bool {
    const PATTERNS: [&str; 5] = ["secret", "token", "password", "key", "credential"];
    let lower = key.to_ascii_lowercase();
    PATTERNS.iter().any(|p| lower.contains(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> ContentHash {
        ContentHash::of(b"root")
    }

    #[test]
    fn secret_values_are_redacted_but_keys_kept() {
        let mut env = BTreeMap::new();
        env.insert("PATH".to_string(), "/usr/bin".to_string());
        env.insert("API_TOKEN".to_string(), "super-secret".to_string());
        let inputs = EnvironmentInputs {
            env,
            ..Default::default()
        };
        let manifest = Manifest::new(inputs, root());
        assert_eq!(manifest.env.get("PATH").unwrap(), "/usr/bin");
        assert_eq!(manifest.env.get("API_TOKEN").unwrap(), REDACTED);
    }

    #[test]
    fn packages_and_tools_are_sorted() {
        let inputs = EnvironmentInputs {
            packages: vec![
                Package {
                    name: "zlib".into(),
                    version: "1".into(),
                },
                Package {
                    name: "acme".into(),
                    version: "2".into(),
                },
            ],
            tools: vec!["ripgrep".into(), "bat".into(), "bat".into()],
            ..Default::default()
        };
        let manifest = Manifest::new(inputs, root());
        assert_eq!(manifest.packages[0].name, "acme");
        assert_eq!(
            manifest.tools,
            vec!["bat".to_string(), "ripgrep".to_string()]
        );
    }

    // Guards the Rust side of the cross-language manifest contract against the committed
    // fixture (packages/verify/fixtures/manifest.json). The TypeScript verifier pins the same
    // values; if the engine's canonical encoding or hash drifts, this fails and the fixture
    // must be regenerated deliberately via `cargo run -p reeg-snapshot --example conformance`.
    #[test]
    fn conformance_fixture_is_stable() {
        const MANIFEST_BYTES_HEX: &str = "7b22736368656d615f76657273696f6e223a312c227061636b61676573223a5b7b226e616d65223a226e6f6465222c2276657273696f6e223a223234227d2c7b226e616d65223a2272757374222c2276657273696f6e223a22312e3935227d5d2c22656e76223a7b224c414e47223a22656e222c2250415448223a222f7573722f62696e227d2c22746f6f6c73223a5b22676974222c2272697067726570225d2c226d656d6f72795f706f696e746572223a6e756c6c2c22776f726b6469725f726f6f745f68617368223a2230626634356262653932386362333861356233623838306665326237613566333864326132383661653664643336353232663361323363653136323537653565227d";
        const MANIFEST_HASH_HEX: &str =
            "76e3eb14b5717f888d10085fa2220a55a4e9e4d7f9a5fcf0afcebf1dd0e8d52f";

        let mut env = BTreeMap::new();
        env.insert("PATH".to_string(), "/usr/bin".to_string());
        env.insert("LANG".to_string(), "en".to_string());
        let inputs = EnvironmentInputs {
            packages: vec![
                Package {
                    name: "rust".into(),
                    version: "1.95".into(),
                },
                Package {
                    name: "node".into(),
                    version: "24".into(),
                },
            ],
            env,
            tools: vec!["ripgrep".into(), "git".into(), "git".into()],
            memory_pointer: None,
        };
        let manifest = Manifest::new(inputs, ContentHash::of(b"reeg-conformance-root"));

        assert_eq!(
            hex::encode(manifest.canonical_bytes().unwrap()),
            MANIFEST_BYTES_HEX
        );
        assert_eq!(
            manifest.manifest_hash().unwrap().to_hex(),
            MANIFEST_HASH_HEX
        );
    }

    // Guards the non-ASCII fixture (packages/verify/fixtures/manifest-nonascii.json): the
    // engine's byte-wise String ordering must stay stable, and the TS verifier's compareUtf8
    // must reproduce it. Regenerate via the conformance_nonascii example.
    #[test]
    fn conformance_nonascii_fixture_is_stable() {
        const MANIFEST_HASH_HEX: &str =
            "f987a122c0ea0c9bdb4f9e77f6c64181ceeedef6f0f0de329f1ef7cc4a3f69b3";

        let low = "\u{E000}".to_string();
        let high = "\u{10000}".to_string();
        let mut env = BTreeMap::new();
        env.insert(high.clone(), "h".to_string());
        env.insert(low.clone(), "l".to_string());
        let inputs = EnvironmentInputs {
            packages: vec![
                Package {
                    name: high.clone(),
                    version: "1".into(),
                },
                Package {
                    name: low.clone(),
                    version: "1".into(),
                },
            ],
            env,
            tools: vec![high, low],
            memory_pointer: None,
        };
        let manifest = Manifest::new(inputs, ContentHash::of(b"reeg-nonascii-root"));

        assert_eq!(
            manifest.manifest_hash().unwrap().to_hex(),
            MANIFEST_HASH_HEX
        );
    }

    #[test]
    fn manifest_hash_is_stable_and_order_independent() {
        let mut env_a = BTreeMap::new();
        env_a.insert("B".to_string(), "2".to_string());
        env_a.insert("A".to_string(), "1".to_string());
        let manifest_a = Manifest::new(
            EnvironmentInputs {
                env: env_a,
                tools: vec!["b".into(), "a".into()],
                ..Default::default()
            },
            root(),
        );

        let mut env_b = BTreeMap::new();
        env_b.insert("A".to_string(), "1".to_string());
        env_b.insert("B".to_string(), "2".to_string());
        let manifest_b = Manifest::new(
            EnvironmentInputs {
                env: env_b,
                tools: vec!["a".into(), "b".into()],
                ..Default::default()
            },
            root(),
        );

        assert_eq!(
            manifest_a.manifest_hash().unwrap(),
            manifest_b.manifest_hash().unwrap()
        );
    }
}
