//! `subfrost` — CLI for subfrost.io admin operations, at full parity with
//! the subfrost.io admin webapp.
//!
//! Drives the `/api/v1` Bearer-key REST API (see the README for the auth
//! model and the full command tree). Each command maps to exactly one
//! documented endpoint. The legacy `x-admin-secret` bootstrap routes
//! (`POST /api/admin/keys`, `POST /api/admin/users`) remain reachable for
//! minting the first key; see the README's "Bootstrapping" note.
//!
//! The command tree is grouped by resource at the top level (`whoami`,
//! `users`, `keys`, `sessions`, `fuel`, `codes`, `communities`, `kyc`,
//! `fincen`, `mtl`, `billing`, `financials`, `documents`, `articles`,
//! `audit`).
//!
//! For mutation bodies, create/update commands expose typed flags for the
//! common fields PLUS a `--data '<json>'` escape hatch whose object fields are
//! merged over (and so can override) the typed flags.

mod client;
mod config;
mod output;

use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand};
use serde_json::{json, Map, Value};

use client::ApiClient;
use config::Config;

#[derive(Parser)]
#[command(
    name = "subfrost",
    about = "CLI for subfrost.io admin operations (via tlsfetch, /api/v1 Bearer API)",
    version
)]
struct Cli {
    /// Emit raw JSON instead of a human-readable table.
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show the caller's own identity (GET /api/v1/me).
    Whoami,
    /// Manage CMS / IAM user accounts (/api/v1/users).
    Users(UsersArgs),
    /// Manage API keys (/api/v1/keys).
    Keys(KeysArgs),
    /// Inspect & revoke user sessions (/api/v1/sessions).
    Sessions(SessionsArgs),
    /// Manage fuel allocations (/api/v1/fuel).
    Fuel(FuelArgs),
    /// Manage referral / redemption codes (/api/v1/codes).
    Codes(CodesArgs),
    /// Inspect referral communities (/api/v1/communities).
    Communities(CommunitiesArgs),
    /// KYC review & screening (/api/v1/kyc).
    Kyc(KycArgs),
    /// FinCEN SAR/CTR filings (/api/v1/fincen).
    Fincen(FincenArgs),
    /// Money-transmitter-license tracking (/api/v1/mtl).
    Mtl(MtlArgs),
    /// Billing: subscriptions, promo, customers, ACH, … (/api/v1/billing).
    Billing(BillingArgs),
    /// Financials: treasury, accounting, equity, balance sheet (/api/v1/financials).
    Financials(FinancialsArgs),
    /// Documents: agreements, e-sign, templates (/api/v1/documents).
    Documents(DocumentsArgs),
    /// Files: the Documents file manager — folders + file objects (/api/v1/files).
    Files(FilesArgs),
    /// News articles (/api/v1/articles + bootstrap upload).
    Articles(ArticlesArgs),
    /// Audit log (/api/v1/audit).
    Audit(AuditArgs),
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

/// Parse a `--data` JSON string into an object, erroring if it isn't one.
fn parse_data(data: &Option<String>) -> Result<Map<String, Value>> {
    match data {
        None => Ok(Map::new()),
        Some(s) => {
            let v: Value = serde_json::from_str(s).context("--data is not valid JSON")?;
            match v {
                Value::Object(m) => Ok(m),
                _ => anyhow::bail!("--data must be a JSON object"),
            }
        }
    }
}

/// Merge `--data` object fields over a typed body (data wins on conflict).
fn merge_data(mut body: Value, data: &Option<String>) -> Result<Value> {
    let overrides = parse_data(data)?;
    if let Value::Object(map) = &mut body {
        for (k, v) in overrides {
            map.insert(k, v);
        }
    }
    Ok(body)
}

/// Set `body[key] = val` when `val` is Some.
fn set_opt<T: Into<Value>>(body: &mut Value, key: &str, val: Option<T>) {
    if let Some(v) = val {
        body[key] = v.into();
    }
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let api = ApiClient::new(Config::load()?);
    let j = cli.json;

    match &cli.command {
        Command::Whoami => run_whoami(&api, j),
        Command::Users(a) => run_users(&api, a, j),
        Command::Keys(a) => run_keys(&api, a, j),
        Command::Sessions(a) => run_sessions(&api, a, j),
        Command::Fuel(a) => run_fuel(&api, a, j),
        Command::Codes(a) => run_codes(&api, a, j),
        Command::Communities(a) => run_communities(&api, a, j),
        Command::Kyc(a) => run_kyc(&api, a, j),
        Command::Fincen(a) => run_fincen(&api, a, j),
        Command::Mtl(a) => run_mtl(&api, a, j),
        Command::Billing(a) => run_billing(&api, a, j),
        Command::Financials(a) => run_financials(&api, a, j),
        Command::Documents(a) => run_documents(&api, a, j),
        Command::Files(a) => run_files(&api, a, j),
        Command::Articles(a) => run_articles(&api, a, j),
        Command::Audit(a) => run_audit(&api, a, j),
    }
}

// ----------------------------------------------------------------------------
// whoami
// ----------------------------------------------------------------------------

fn run_whoami(api: &ApiClient, j: bool) -> Result<()> {
    let r = api.get_json("/api/v1/me")?;
    output::render_object(&r, j);
    Ok(())
}

// ----------------------------------------------------------------------------
// users
// ----------------------------------------------------------------------------

#[derive(Args)]
struct UsersArgs {
    #[command(subcommand)]
    command: UsersCommand,
}

#[derive(Subcommand)]
enum UsersCommand {
    /// List all accounts (GET /api/v1/users).
    List,
    /// Show one account (GET /api/v1/users/:id).
    Get {
        /// User id.
        id: String,
    },
    /// Create an account (POST /api/v1/users). No password ⇒ server returns a
    /// tempPassword.
    Create(UsersCreateArgs),
    /// Update an account (PATCH /api/v1/users/:id).
    Update(UsersUpdateArgs),
    /// Delete an account (DELETE /api/v1/users/:id).
    Delete {
        /// User id.
        id: String,
    },
    /// Set an account's password (POST /api/v1/users/:id/password).
    SetPassword {
        /// User id.
        id: String,
        /// New password.
        #[arg(long)]
        password: String,
    },
}

#[derive(Args)]
struct UsersCreateArgs {
    /// Account email.
    #[arg(long)]
    email: String,
    /// Display name.
    #[arg(long)]
    name: Option<String>,
    /// Account role (e.g. ADMIN | EDITOR | AUTHOR | STAFF).
    #[arg(long)]
    role: Option<String>,
    /// Password. Omit to have the server mint a tempPassword.
    #[arg(long)]
    password: Option<String>,
    /// IAM privilege grants (repeatable).
    #[arg(long, value_name = "PRIV")]
    privileges: Vec<String>,
    /// Raw JSON merged over the typed fields above.
    #[arg(long)]
    data: Option<String>,
}

#[derive(Args)]
struct UsersUpdateArgs {
    /// User id.
    id: String,
    /// New display name.
    #[arg(long)]
    name: Option<String>,
    /// New role.
    #[arg(long)]
    role: Option<String>,
    /// Active/inactive.
    #[arg(long)]
    active: Option<bool>,
    /// IAM privilege grants (repeatable, replaces the set).
    #[arg(long, value_name = "PRIV")]
    privileges: Vec<String>,
    /// Raw JSON merged over the typed fields above.
    #[arg(long)]
    data: Option<String>,
}

fn run_users(api: &ApiClient, args: &UsersArgs, j: bool) -> Result<()> {
    match &args.command {
        UsersCommand::List => {
            let r = api.get_json("/api/v1/users")?;
            output::render(&r, j, "users", &["id", "email", "name", "role", "active"]);
        }
        UsersCommand::Get { id } => {
            let r = api.get_json(&format!("/api/v1/users/{id}"))?;
            output::render_object(&r, j);
        }
        UsersCommand::Create(c) => {
            let mut body = json!({ "email": c.email });
            set_opt(&mut body, "name", c.name.clone());
            set_opt(&mut body, "role", c.role.clone());
            set_opt(&mut body, "password", c.password.clone());
            if !c.privileges.is_empty() {
                body["privileges"] = json!(c.privileges);
            }
            let body = merge_data(body, &c.data)?;
            let r = api.post_json("/api/v1/users", &body)?;
            output::render_object(&r, j);
        }
        UsersCommand::Update(u) => {
            let mut body = json!({});
            set_opt(&mut body, "name", u.name.clone());
            set_opt(&mut body, "role", u.role.clone());
            set_opt(&mut body, "active", u.active);
            if !u.privileges.is_empty() {
                body["privileges"] = json!(u.privileges);
            }
            let body = merge_data(body, &u.data)?;
            let r = api.patch_json(&format!("/api/v1/users/{}", u.id), &body)?;
            output::render_object(&r, j);
        }
        UsersCommand::Delete { id } => {
            let r = api.delete_json::<Value>(&format!("/api/v1/users/{id}"), None)?;
            output::render_object(&r, j);
        }
        UsersCommand::SetPassword { id, password } => {
            let body = json!({ "password": password });
            let r = api.post_json(&format!("/api/v1/users/{id}/password"), &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// keys
// ----------------------------------------------------------------------------

#[derive(Args)]
struct KeysArgs {
    #[command(subcommand)]
    command: KeysCommand,
}

#[derive(Subcommand)]
enum KeysCommand {
    /// List all API keys (GET /api/v1/keys).
    List,
    /// Mint a new API key (POST /api/v1/keys). Token is shown once.
    Create(KeysCreateArgs),
    /// Revoke a key (DELETE /api/v1/keys/:id).
    Delete {
        /// Key id.
        id: String,
    },
}

#[derive(Args)]
struct KeysCreateArgs {
    /// Human label for the key.
    #[arg(long)]
    name: Option<String>,
    /// Scopes to grant (repeatable).
    #[arg(long, value_name = "SCOPE")]
    scopes: Vec<String>,
    /// Days until the key expires.
    #[arg(long)]
    expires_in_days: Option<u64>,
    /// Raw JSON merged over the typed fields above.
    #[arg(long)]
    data: Option<String>,
}

fn run_keys(api: &ApiClient, args: &KeysArgs, j: bool) -> Result<()> {
    match &args.command {
        KeysCommand::List => {
            let r = api.get_json("/api/v1/keys")?;
            output::render(&r, j, "keys", &["id", "prefix", "name", "revoked", "lastUsedAt"]);
        }
        KeysCommand::Create(c) => {
            let mut body = json!({});
            set_opt(&mut body, "name", c.name.clone());
            if !c.scopes.is_empty() {
                body["scopes"] = json!(c.scopes);
            }
            set_opt(&mut body, "expiresInDays", c.expires_in_days);
            let body = merge_data(body, &c.data)?;
            let r = api.post_json("/api/v1/keys", &body)?;
            output::render_object(&r, j);
        }
        KeysCommand::Delete { id } => {
            let r = api.delete_json::<Value>(&format!("/api/v1/keys/{id}"), None)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// sessions
// ----------------------------------------------------------------------------

#[derive(Args)]
struct SessionsArgs {
    #[command(subcommand)]
    command: SessionsCommand,
}

#[derive(Subcommand)]
enum SessionsCommand {
    /// List a user's sessions (GET /api/v1/sessions?user=<id>).
    List {
        /// User id.
        #[arg(long)]
        user: String,
    },
    /// Revoke all of a user's sessions (DELETE /api/v1/sessions?user=<id>).
    RevokeAll {
        /// User id.
        #[arg(long)]
        user: String,
    },
    /// Revoke one session (DELETE /api/v1/sessions/:id?user=<id>).
    Revoke {
        /// Session id.
        id: String,
        /// Owning user id.
        #[arg(long)]
        user: String,
    },
}

fn run_sessions(api: &ApiClient, args: &SessionsArgs, j: bool) -> Result<()> {
    match &args.command {
        SessionsCommand::List { user } => {
            let r = api.get_json(&format!("/api/v1/sessions?user={user}"))?;
            output::render(
                &r,
                j,
                "sessions",
                &["id", "createdAt", "expiresAt", "userAgent", "ip"],
            );
        }
        SessionsCommand::RevokeAll { user } => {
            let r = api.delete_json::<Value>(&format!("/api/v1/sessions?user={user}"), None)?;
            output::render_object(&r, j);
        }
        SessionsCommand::Revoke { id, user } => {
            let r =
                api.delete_json::<Value>(&format!("/api/v1/sessions/{id}?user={user}"), None)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// fuel
// ----------------------------------------------------------------------------

#[derive(Args)]
struct FuelArgs {
    #[command(subcommand)]
    command: FuelCommand,
}

#[derive(Subcommand)]
enum FuelCommand {
    /// List fuel allocations (GET /api/v1/fuel).
    List,
    /// Upsert a fuel allocation (POST /api/v1/fuel).
    Set(FuelSetArgs),
    /// Delete an allocation (DELETE /api/v1/fuel/:id).
    Delete {
        /// Allocation id.
        id: String,
    },
}

#[derive(Args)]
struct FuelSetArgs {
    /// Target user id.
    #[arg(long)]
    user: Option<String>,
    /// Allocation amount.
    #[arg(long)]
    amount: Option<f64>,
    /// Raw JSON merged over the typed fields above (full body escape hatch).
    #[arg(long)]
    data: Option<String>,
}

fn run_fuel(api: &ApiClient, args: &FuelArgs, j: bool) -> Result<()> {
    match &args.command {
        FuelCommand::List => {
            let r = api.get_json("/api/v1/fuel")?;
            output::render(&r, j, "fuel", &["id", "userId", "amount", "updatedAt"]);
        }
        FuelCommand::Set(s) => {
            let mut body = json!({});
            set_opt(&mut body, "userId", s.user.clone());
            set_opt(&mut body, "amount", s.amount);
            let body = merge_data(body, &s.data)?;
            let r = api.post_json("/api/v1/fuel", &body)?;
            output::render_object(&r, j);
        }
        FuelCommand::Delete { id } => {
            let r = api.delete_json::<Value>(&format!("/api/v1/fuel/{id}"), None)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// codes
// ----------------------------------------------------------------------------

#[derive(Args)]
struct CodesArgs {
    #[command(subcommand)]
    command: CodesCommand,
}

#[derive(Subcommand)]
enum CodesCommand {
    /// List codes (GET /api/v1/codes).
    List,
    /// Referral tree (GET /api/v1/codes/tree).
    Tree,
    /// Redemptions (GET /api/v1/codes/redemptions).
    Redemptions,
    /// Create a code (POST /api/v1/codes).
    Create(CodesCreateArgs),
    /// Bulk-create codes (POST /api/v1/codes/bulk).
    Bulk {
        /// Raw JSON body (e.g. `{"count":10,"prefix":"X"}`).
        #[arg(long)]
        data: String,
    },
    /// Update a code (PATCH /api/v1/codes/:id).
    Update(CodesUpdateArgs),
    /// Delete a code (DELETE /api/v1/codes/:id).
    Delete {
        /// Code id.
        id: String,
    },
}

#[derive(Args)]
struct CodesCreateArgs {
    /// Code string.
    #[arg(long)]
    code: Option<String>,
    /// Max redemptions.
    #[arg(long)]
    max_uses: Option<u64>,
    /// Raw JSON merged over the typed fields above.
    #[arg(long)]
    data: Option<String>,
}

#[derive(Args)]
struct CodesUpdateArgs {
    /// Code id.
    id: String,
    /// Enabled/disabled.
    #[arg(long)]
    active: Option<bool>,
    /// Max redemptions.
    #[arg(long)]
    max_uses: Option<u64>,
    /// Raw JSON merged over the typed fields above.
    #[arg(long)]
    data: Option<String>,
}

fn run_codes(api: &ApiClient, args: &CodesArgs, j: bool) -> Result<()> {
    match &args.command {
        CodesCommand::List => {
            let r = api.get_json("/api/v1/codes")?;
            output::render(
                &r,
                j,
                "codes",
                &["id", "code", "active", "uses", "maxUses"],
            );
        }
        CodesCommand::Tree => {
            let r = api.get_json("/api/v1/codes/tree")?;
            output::render_object(&r, j);
        }
        CodesCommand::Redemptions => {
            let r = api.get_json("/api/v1/codes/redemptions")?;
            output::render(
                &r,
                j,
                "redemptions",
                &["id", "code", "userId", "redeemedAt"],
            );
        }
        CodesCommand::Create(c) => {
            let mut body = json!({});
            set_opt(&mut body, "code", c.code.clone());
            set_opt(&mut body, "maxUses", c.max_uses);
            let body = merge_data(body, &c.data)?;
            let r = api.post_json("/api/v1/codes", &body)?;
            output::render_object(&r, j);
        }
        CodesCommand::Bulk { data } => {
            let body = merge_data(json!({}), &Some(data.clone()))?;
            let r = api.post_json("/api/v1/codes/bulk", &body)?;
            output::render_object(&r, j);
        }
        CodesCommand::Update(u) => {
            let mut body = json!({});
            set_opt(&mut body, "active", u.active);
            set_opt(&mut body, "maxUses", u.max_uses);
            let body = merge_data(body, &u.data)?;
            let r = api.patch_json(&format!("/api/v1/codes/{}", u.id), &body)?;
            output::render_object(&r, j);
        }
        CodesCommand::Delete { id } => {
            let r = api.delete_json::<Value>(&format!("/api/v1/codes/{id}"), None)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// communities
// ----------------------------------------------------------------------------

#[derive(Args)]
struct CommunitiesArgs {
    #[command(subcommand)]
    command: CommunitiesCommand,
}

#[derive(Subcommand)]
enum CommunitiesCommand {
    /// List communities (GET /api/v1/communities).
    List,
    /// Show one community by its root id (GET /api/v1/communities/:rootId).
    Get {
        /// Root id.
        root_id: String,
    },
}

fn run_communities(api: &ApiClient, args: &CommunitiesArgs, j: bool) -> Result<()> {
    match &args.command {
        CommunitiesCommand::List => {
            let r = api.get_json("/api/v1/communities")?;
            output::render(
                &r,
                j,
                "communities",
                &["rootId", "size", "depth", "rootEmail"],
            );
        }
        CommunitiesCommand::Get { root_id } => {
            let r = api.get_json(&format!("/api/v1/communities/{root_id}"))?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// kyc
// ----------------------------------------------------------------------------

#[derive(Args)]
struct KycArgs {
    #[command(subcommand)]
    command: KycCommand,
}

#[derive(Subcommand)]
enum KycCommand {
    /// List KYC records (GET /api/v1/kyc).
    List,
    /// Trigger a rescreen (POST /api/v1/kyc/rescreen).
    Rescreen {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Record a disposition (POST /api/v1/kyc/:id/disposition).
    Disposition(KycDispositionArgs),
    /// Sync from the provider (POST /api/v1/kyc/sync).
    Sync {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
}

#[derive(Args)]
struct KycDispositionArgs {
    /// KYC record id.
    id: String,
    /// Disposition decision (e.g. APPROVE | REJECT | REVIEW).
    #[arg(long)]
    decision: Option<String>,
    /// Reviewer note.
    #[arg(long)]
    note: Option<String>,
    /// Raw JSON merged over the typed fields above.
    #[arg(long)]
    data: Option<String>,
}

fn run_kyc(api: &ApiClient, args: &KycArgs, j: bool) -> Result<()> {
    match &args.command {
        KycCommand::List => {
            let r = api.get_json("/api/v1/kyc")?;
            output::render(
                &r,
                j,
                "kyc",
                &["id", "userId", "status", "level", "updatedAt"],
            );
        }
        KycCommand::Rescreen { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/kyc/rescreen", &body)?;
            output::render_object(&r, j);
        }
        KycCommand::Disposition(d) => {
            let mut body = json!({});
            set_opt(&mut body, "decision", d.decision.clone());
            set_opt(&mut body, "note", d.note.clone());
            let body = merge_data(body, &d.data)?;
            let r = api.post_json(&format!("/api/v1/kyc/{}/disposition", d.id), &body)?;
            output::render_object(&r, j);
        }
        KycCommand::Sync { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/kyc/sync", &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// fincen
// ----------------------------------------------------------------------------

#[derive(Args)]
struct FincenArgs {
    #[command(subcommand)]
    command: FincenCommand,
}

#[derive(Subcommand)]
enum FincenCommand {
    /// List FinCEN filings (GET /api/v1/fincen).
    List,
    /// Create a SAR draft (POST /api/v1/fincen/sar).
    Sar {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Update a SAR (PATCH /api/v1/fincen/sar/:id).
    SarUpdate {
        /// SAR id.
        id: String,
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Create a CTR draft (POST /api/v1/fincen/ctr).
    Ctr {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Update a CTR (PATCH /api/v1/fincen/ctr/:id).
    CtrUpdate {
        /// CTR id.
        id: String,
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Queue a draft for filing (POST /api/v1/fincen/queue {draftId}).
    Queue {
        /// Draft id to queue.
        #[arg(long)]
        draft_id: String,
    },
}

fn run_fincen(api: &ApiClient, args: &FincenArgs, j: bool) -> Result<()> {
    match &args.command {
        FincenCommand::List => {
            let r = api.get_json("/api/v1/fincen")?;
            output::render(
                &r,
                j,
                "filings",
                &["id", "type", "status", "createdAt"],
            );
        }
        FincenCommand::Sar { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/fincen/sar", &body)?;
            output::render_object(&r, j);
        }
        FincenCommand::SarUpdate { id, data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.patch_json(&format!("/api/v1/fincen/sar/{id}"), &body)?;
            output::render_object(&r, j);
        }
        FincenCommand::Ctr { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/fincen/ctr", &body)?;
            output::render_object(&r, j);
        }
        FincenCommand::CtrUpdate { id, data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.patch_json(&format!("/api/v1/fincen/ctr/{id}"), &body)?;
            output::render_object(&r, j);
        }
        FincenCommand::Queue { draft_id } => {
            let body = json!({ "draftId": draft_id });
            let r = api.post_json("/api/v1/fincen/queue", &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// mtl
// ----------------------------------------------------------------------------

#[derive(Args)]
struct MtlArgs {
    #[command(subcommand)]
    command: MtlCommand,
}

#[derive(Subcommand)]
enum MtlCommand {
    /// List MTL records (GET /api/v1/mtl).
    List,
    /// Seed MTL data (POST /api/v1/mtl/seed).
    Seed {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Update an MTL record (PATCH /api/v1/mtl/:id).
    Update {
        /// MTL record id.
        id: String,
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
}

fn run_mtl(api: &ApiClient, args: &MtlArgs, j: bool) -> Result<()> {
    match &args.command {
        MtlCommand::List => {
            let r = api.get_json("/api/v1/mtl")?;
            output::render(
                &r,
                j,
                "mtl",
                &["id", "state", "status", "expiresAt"],
            );
        }
        MtlCommand::Seed { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/mtl/seed", &body)?;
            output::render_object(&r, j);
        }
        MtlCommand::Update { id, data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.patch_json(&format!("/api/v1/mtl/{id}"), &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// billing
// ----------------------------------------------------------------------------

#[derive(Args)]
struct BillingArgs {
    #[command(subcommand)]
    command: BillingCommand,
}

#[derive(Subcommand)]
enum BillingCommand {
    /// List subscriptions (GET /api/v1/billing/subscriptions).
    Subscriptions,
    /// List promos (GET /api/v1/billing/promo).
    Promo,
    /// Create a promo (POST /api/v1/billing/promo).
    PromoCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// List customers (GET /api/v1/billing/customers).
    Customers,
    /// Show one customer (GET /api/v1/billing/customers/:id).
    Customer {
        /// Customer id.
        id: String,
    },
    /// List transactions (GET /api/v1/billing/transactions).
    Transactions,
    /// List balances (GET /api/v1/billing/balances).
    Balances,
    /// List ACH intents (GET /api/v1/billing/intents).
    Intents,
    /// Queue an ACH intent (POST /api/v1/billing/intents).
    IntentCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Confirm/cancel an intent (POST /api/v1/billing/intents/:id?action=…).
    IntentAction {
        /// Intent id.
        id: String,
        /// Action to take.
        #[arg(long, value_parser = ["confirm", "cancel"])]
        action: String,
    },
    /// List applications (GET /api/v1/billing/applications).
    Applications,
    /// List billing events (GET /api/v1/billing/events).
    Events,
}

fn run_billing(api: &ApiClient, args: &BillingArgs, j: bool) -> Result<()> {
    match &args.command {
        BillingCommand::Subscriptions => {
            let r = api.get_json("/api/v1/billing/subscriptions")?;
            output::render(
                &r,
                j,
                "subscriptions",
                &["id", "customerId", "status", "plan", "currentPeriodEnd"],
            );
        }
        BillingCommand::Promo => {
            let r = api.get_json("/api/v1/billing/promo")?;
            output::render(
                &r,
                j,
                "promos",
                &["id", "code", "percentOff", "active"],
            );
        }
        BillingCommand::PromoCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/billing/promo", &body)?;
            output::render_object(&r, j);
        }
        BillingCommand::Customers => {
            let r = api.get_json("/api/v1/billing/customers")?;
            output::render(
                &r,
                j,
                "customers",
                &["id", "email", "name", "balance"],
            );
        }
        BillingCommand::Customer { id } => {
            let r = api.get_json(&format!("/api/v1/billing/customers/{id}"))?;
            output::render_object(&r, j);
        }
        BillingCommand::Transactions => {
            let r = api.get_json("/api/v1/billing/transactions")?;
            output::render(
                &r,
                j,
                "transactions",
                &["id", "customerId", "amount", "status", "createdAt"],
            );
        }
        BillingCommand::Balances => {
            let r = api.get_json("/api/v1/billing/balances")?;
            output::render(
                &r,
                j,
                "balances",
                &["id", "customerId", "available", "pending", "currency"],
            );
        }
        BillingCommand::Intents => {
            let r = api.get_json("/api/v1/billing/intents")?;
            output::render(
                &r,
                j,
                "intents",
                &["id", "customerId", "amount", "status", "createdAt"],
            );
        }
        BillingCommand::IntentCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json("/api/v1/billing/intents", &body)?;
            output::render_object(&r, j);
        }
        BillingCommand::IntentAction { id, action } => {
            let r = api.post_json::<Value>(
                &format!("/api/v1/billing/intents/{id}?action={action}"),
                &json!({}),
            )?;
            output::render_object(&r, j);
        }
        BillingCommand::Applications => {
            let r = api.get_json("/api/v1/billing/applications")?;
            output::render(
                &r,
                j,
                "applications",
                &["id", "status", "businessName", "createdAt"],
            );
        }
        BillingCommand::Events => {
            let r = api.get_json("/api/v1/billing/events")?;
            output::render(
                &r,
                j,
                "events",
                &["id", "type", "createdAt"],
            );
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// financials
// ----------------------------------------------------------------------------

#[derive(Args)]
struct FinancialsArgs {
    #[command(subcommand)]
    command: FinancialsCommand,
}

#[derive(Subcommand)]
enum FinancialsCommand {
    /// Treasury snapshot (GET /api/v1/financials/treasury).
    Treasury {
        /// Force a refresh (appends ?refresh=true).
        #[arg(long)]
        refresh: bool,
    },
    /// Accounting overview (GET /api/v1/financials/accounting).
    Accounting,
    /// Download the general-ledger CSV (GET .../accounting/ledger.csv).
    LedgerCsv,
    /// List payees (GET .../accounting/payees).
    Payees,
    /// Create a payee (POST .../accounting/payees).
    PayeeCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Update a payee (PATCH .../accounting/payees/:id).
    PayeeUpdate {
        /// Payee id.
        id: String,
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// List invoices (GET .../accounting/invoices).
    Invoices,
    /// Create an invoice (POST .../accounting/invoices).
    InvoiceCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Update an invoice's status (PATCH .../accounting/invoices/:id).
    InvoiceStatus {
        /// Invoice id.
        id: String,
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Record a payment (POST .../accounting/payments).
    PaymentRecord {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Cap table / equity overview (GET .../equity).
    Equity,
    /// Create a share class (POST .../equity/share-classes).
    ShareClassCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Create a shareholder (POST .../equity/shareholders).
    ShareholderCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Create a holding (POST .../equity/holdings).
    HoldingCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Create an instrument (POST .../equity/instruments).
    InstrumentCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Balance sheet (GET .../balance-sheet).
    BalanceSheet,
    /// Create a balance-sheet item (POST .../balance-sheet/items).
    BsItemCreate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
}

fn run_financials(api: &ApiClient, args: &FinancialsArgs, j: bool) -> Result<()> {
    let base = "/api/v1/financials";
    match &args.command {
        FinancialsCommand::Treasury { refresh } => {
            let path = if *refresh {
                format!("{base}/treasury?refresh=true")
            } else {
                format!("{base}/treasury")
            };
            let r = api.get_json(&path)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::Accounting => {
            let r = api.get_json(&format!("{base}/accounting"))?;
            output::render_object(&r, j);
        }
        FinancialsCommand::LedgerCsv => {
            // Raw CSV body — print verbatim, no JSON parsing.
            let csv = api.get_text(&format!("{base}/accounting/ledger.csv"))?;
            print!("{csv}");
        }
        FinancialsCommand::Payees => {
            let r = api.get_json(&format!("{base}/accounting/payees"))?;
            output::render(
                &r,
                j,
                "payees",
                &["id", "name", "email", "type", "createdAt"],
            );
        }
        FinancialsCommand::PayeeCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/accounting/payees"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::PayeeUpdate { id, data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.patch_json(&format!("{base}/accounting/payees/{id}"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::Invoices => {
            let r = api.get_json(&format!("{base}/accounting/invoices"))?;
            output::render(
                &r,
                j,
                "invoices",
                &["id", "number", "payeeId", "amount", "status", "dueAt"],
            );
        }
        FinancialsCommand::InvoiceCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/accounting/invoices"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::InvoiceStatus { id, data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.patch_json(&format!("{base}/accounting/invoices/{id}"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::PaymentRecord { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/accounting/payments"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::Equity => {
            let r = api.get_json(&format!("{base}/equity"))?;
            output::render_object(&r, j);
        }
        FinancialsCommand::ShareClassCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/equity/share-classes"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::ShareholderCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/equity/shareholders"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::HoldingCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/equity/holdings"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::InstrumentCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/equity/instruments"), &body)?;
            output::render_object(&r, j);
        }
        FinancialsCommand::BalanceSheet => {
            let r = api.get_json(&format!("{base}/balance-sheet"))?;
            output::render_object(&r, j);
        }
        FinancialsCommand::BsItemCreate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/balance-sheet/items"), &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// documents
// ----------------------------------------------------------------------------

#[derive(Args)]
struct DocumentsArgs {
    #[command(subcommand)]
    command: DocumentsCommand,
}

#[derive(Subcommand)]
enum DocumentsCommand {
    /// List documents (GET /api/v1/documents).
    List,
    /// Show one document (GET /api/v1/documents/:id).
    Get {
        /// Document id.
        id: String,
    },
    /// Create a document (POST /api/v1/documents).
    Create {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
    /// Send a document for signature (POST /api/v1/documents/:id/send).
    Send {
        /// Document id.
        id: String,
    },
    /// Void a document (POST /api/v1/documents/:id/void).
    Void {
        /// Document id.
        id: String,
        /// Optional reason (sent as `{reason}`).
        #[arg(long)]
        reason: Option<String>,
    },
    /// Resend a document (POST /api/v1/documents/:id/resend).
    Resend {
        /// Document id.
        id: String,
    },
    /// Refresh a document's status (POST /api/v1/documents/:id/refresh).
    Refresh {
        /// Document id.
        id: String,
    },
    /// List document templates (GET /api/v1/documents/templates).
    Templates,
    /// Create a document from a template (POST /api/v1/documents/from-template).
    FromTemplate {
        /// Raw JSON body.
        #[arg(long)]
        data: Option<String>,
    },
}

fn run_documents(api: &ApiClient, args: &DocumentsArgs, j: bool) -> Result<()> {
    let base = "/api/v1/documents";
    match &args.command {
        DocumentsCommand::List => {
            let r = api.get_json(base)?;
            output::render(
                &r,
                j,
                "documents",
                &["id", "title", "status", "type", "createdAt"],
            );
        }
        DocumentsCommand::Get { id } => {
            let r = api.get_json(&format!("{base}/{id}"))?;
            output::render_object(&r, j);
        }
        DocumentsCommand::Create { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(base, &body)?;
            output::render_object(&r, j);
        }
        DocumentsCommand::Send { id } => {
            let r = api.post_json(&format!("{base}/{id}/send"), &json!({}))?;
            output::render_object(&r, j);
        }
        DocumentsCommand::Void { id, reason } => {
            let mut body = json!({});
            set_opt(&mut body, "reason", reason.clone());
            let r = api.post_json(&format!("{base}/{id}/void"), &body)?;
            output::render_object(&r, j);
        }
        DocumentsCommand::Resend { id } => {
            let r = api.post_json(&format!("{base}/{id}/resend"), &json!({}))?;
            output::render_object(&r, j);
        }
        DocumentsCommand::Refresh { id } => {
            let r = api.post_json(&format!("{base}/{id}/refresh"), &json!({}))?;
            output::render_object(&r, j);
        }
        DocumentsCommand::Templates => {
            let r = api.get_json(&format!("{base}/templates"))?;
            output::render(
                &r,
                j,
                "templates",
                &["id", "name", "type", "createdAt"],
            );
        }
        DocumentsCommand::FromTemplate { data } => {
            let body = merge_data(json!({}), data)?;
            let r = api.post_json(&format!("{base}/from-template"), &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// files (the Documents file manager)
// ----------------------------------------------------------------------------

#[derive(Args)]
struct FilesArgs {
    #[command(subcommand)]
    command: FilesCommand,
}

#[derive(Subcommand)]
enum FilesCommand {
    /// List a folder's contents (GET /api/v1/files?folder=<id>).
    Ls {
        /// Folder id to list (omit for the root folder).
        #[arg(long)]
        folder: Option<String>,
    },
    /// Create a folder (POST /api/v1/files/folders).
    Mkdir {
        /// Folder name.
        name: String,
        /// Parent folder id.
        #[arg(long)]
        parent: Option<String>,
    },
    /// Upload a local file (POST /api/v1/files, raw bytes body).
    Upload {
        /// Path to the local file to upload.
        path: String,
        /// Destination folder id.
        #[arg(long)]
        folder: Option<String>,
        /// Override the stored file name (defaults to the local basename).
        #[arg(long)]
        name: Option<String>,
    },
    /// Download a file's bytes (GET /api/v1/files/:id?download=1, then fetch url).
    Download {
        /// File id.
        id: String,
        /// Output path (defaults to the file's stored name).
        #[arg(long)]
        out: Option<String>,
    },
    /// Move a file to another folder (PATCH /api/v1/files/:id {folderId}).
    Mv {
        /// File id.
        id: String,
        /// Destination folder id.
        #[arg(long)]
        folder: String,
    },
    /// Rename a file (PATCH /api/v1/files/:id {name}).
    Rename {
        /// File id.
        id: String,
        /// New name.
        newname: String,
    },
    /// Delete a file (DELETE /api/v1/files/:id).
    Rm {
        /// File id.
        id: String,
    },
    /// Delete a folder (DELETE /api/v1/files/folders/:id).
    Rmdir {
        /// Folder id.
        id: String,
    },
    /// Set tags/metadata on a file (PATCH /api/v1/files/:id {tags?, metadata?}).
    Meta {
        /// File id.
        id: String,
        /// Tag to set (repeatable).
        #[arg(long = "tag", value_name = "TAG")]
        tags: Vec<String>,
        /// Metadata as a JSON object.
        #[arg(long)]
        data: Option<String>,
    },
}

/// Guess a Content-Type from a path's extension. Defaults to
/// `application/octet-stream` for anything unrecognized.
fn guess_content_type(path: &str) -> &'static str {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "txt" | "text" | "log" => "text/plain",
        "md" | "markdown" => "text/markdown",
        "csv" => "text/csv",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "xml" => "application/xml",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "gzip" => "application/gzip",
        "tar" => "application/x-tar",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

fn run_files(api: &ApiClient, args: &FilesArgs, j: bool) -> Result<()> {
    let base = "/api/v1/files";
    match &args.command {
        FilesCommand::Ls { folder } => {
            let path = match folder {
                Some(id) => format!("{base}?folder={id}"),
                None => base.to_string(),
            };
            let r = api.get_json(&path)?;
            if j {
                output::render_object(&r, true);
                return Ok(());
            }
            // Breadcrumb line.
            if let Some(crumbs) = r.get("breadcrumb").and_then(Value::as_array) {
                let trail: Vec<String> = crumbs
                    .iter()
                    .map(|c| {
                        c.get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("?")
                            .to_string()
                    })
                    .collect();
                if !trail.is_empty() {
                    println!("/{}", trail.join("/"));
                }
            }
            output::render(&r, false, "folders", &["name", "id"]);
            output::render(&r, false, "files", &["name", "size", "mimeType", "id"]);
        }
        FilesCommand::Mkdir { name, parent } => {
            let mut body = json!({ "name": name });
            set_opt(&mut body, "parentId", parent.clone());
            let r = api.post_json(&format!("{base}/folders"), &body)?;
            output::render_object(&r, j);
        }
        FilesCommand::Upload { path, folder, name } => {
            let bytes = std::fs::read(path).with_context(|| format!("reading {path}"))?;
            let file_name = match name {
                Some(n) => n.clone(),
                None => std::path::Path::new(path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("upload")
                    .to_string(),
            };
            let content_type = guess_content_type(path);
            let mut headers: Vec<(&str, &str)> = vec![("x-file-name", file_name.as_str())];
            if let Some(id) = folder {
                headers.push(("x-folder-id", id.as_str()));
            }
            let r = api.post_bytes(base, content_type, &bytes, &headers)?;
            output::render_object(&r, j);
        }
        FilesCommand::Download { id, out } => {
            let r = api.get_json(&format!("{base}/{id}?download=1"))?;
            let url = r
                .get("url")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("response had no signed `url` field: {r}"))?;
            let out_path = match out {
                Some(p) => p.clone(),
                None => r
                    .get("file")
                    .and_then(|f| f.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or(id.as_str())
                    .to_string(),
            };
            let bytes = api.get_url_bytes(url)?;
            let n = bytes.len();
            std::fs::write(&out_path, &bytes)
                .with_context(|| format!("writing {out_path}"))?;
            if j {
                output::render_object(&json!({ "path": out_path, "bytes": n }), true);
            } else {
                println!("wrote {n} bytes to {out_path}");
            }
        }
        FilesCommand::Mv { id, folder } => {
            let body = json!({ "folderId": folder });
            let r = api.patch_json(&format!("{base}/{id}"), &body)?;
            output::render_object(&r, j);
        }
        FilesCommand::Rename { id, newname } => {
            let body = json!({ "name": newname });
            let r = api.patch_json(&format!("{base}/{id}"), &body)?;
            output::render_object(&r, j);
        }
        FilesCommand::Rm { id } => {
            let r = api.delete_json::<Value>(&format!("{base}/{id}"), None)?;
            output::render_object(&r, j);
        }
        FilesCommand::Rmdir { id } => {
            let r = api.delete_json::<Value>(&format!("{base}/folders/{id}"), None)?;
            output::render_object(&r, j);
        }
        FilesCommand::Meta { id, tags, data } => {
            let mut body = json!({});
            if !tags.is_empty() {
                body["tags"] = json!(tags);
            }
            if let Some(d) = data {
                let parsed: Value =
                    serde_json::from_str(d).context("--data is not valid JSON")?;
                body["metadata"] = parsed;
            }
            let r = api.patch_json(&format!("{base}/{id}"), &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// articles
// ----------------------------------------------------------------------------

#[derive(Args)]
struct ArticlesArgs {
    #[command(subcommand)]
    command: ArticlesCommand,
}

#[derive(Subcommand)]
enum ArticlesCommand {
    /// List articles (GET /api/v1/articles).
    List,
    /// Get one article's full content — all locales incl. excerpt/sources, tags,
    /// co-authors (GET /api/v1/articles/:id). Shaped as the upload input, so
    /// `get > file.json`, edit, then `upload file.json` round-trips safely.
    Get {
        /// Article id.
        id: String,
    },
    /// Delete an article (DELETE /api/v1/articles/:id).
    Delete {
        /// Article id.
        id: String,
    },
    /// Publish an article (POST /api/v1/articles/:id/publish).
    Publish {
        /// Article id.
        id: String,
    },
    /// Upload an article (POST /api/admin/articles, raw markdown/json body).
    Upload {
        /// Path to the markdown/json file to upload.
        file: String,
    },
}

fn run_articles(api: &ApiClient, args: &ArticlesArgs, j: bool) -> Result<()> {
    match &args.command {
        ArticlesCommand::List => {
            let r = api.get_json("/api/v1/articles")?;
            output::render(
                &r,
                j,
                "articles",
                &["id", "slug", "title", "published", "publishedAt"],
            );
        }
        ArticlesCommand::Get { id } => {
            let r = api.get_json(&format!("/api/v1/articles/{id}"))?;
            output::render_object(&r, j);
        }
        ArticlesCommand::Delete { id } => {
            let r = api.delete_json::<Value>(&format!("/api/v1/articles/{id}"), None)?;
            output::render_object(&r, j);
        }
        ArticlesCommand::Publish { id } => {
            let r = api.post_json(&format!("/api/v1/articles/{id}/publish"), &json!({}))?;
            output::render_object(&r, j);
        }
        ArticlesCommand::Upload { file } => {
            let contents = std::fs::read_to_string(file)
                .with_context(|| format!("reading article file {file}"))?;
            // The upload route takes a raw markdown/json body. If it parses as
            // JSON, send it as a JSON value; otherwise wrap the raw markdown.
            let body: Value = serde_json::from_str(&contents)
                .unwrap_or_else(|_| json!({ "markdown": contents }));
            let r = api.post_json("/api/admin/articles", &body)?;
            output::render_object(&r, j);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// audit
// ----------------------------------------------------------------------------

#[derive(Args)]
struct AuditArgs {
    /// Max number of entries to return.
    #[arg(long)]
    limit: Option<u64>,
    /// Filter by action.
    #[arg(long)]
    action: Option<String>,
}

fn run_audit(api: &ApiClient, args: &AuditArgs, j: bool) -> Result<()> {
    let mut query: Vec<String> = Vec::new();
    if let Some(limit) = args.limit {
        query.push(format!("limit={limit}"));
    }
    if let Some(action) = &args.action {
        query.push(format!("action={action}"));
    }
    let path = if query.is_empty() {
        "/api/v1/audit".to_string()
    } else {
        format!("/api/v1/audit?{}", query.join("&"))
    };
    let r = api.get_json(&path)?;
    output::render(
        &r,
        j,
        "audit",
        &["id", "action", "actor", "target", "createdAt"],
    );
    Ok(())
}
