//! Output rendering: a plain-text table by default, raw JSON with `--json`.
//!
//! The admin routes wrap their list payloads in an envelope
//! (`{"ok":true,"count":N,"users":[...]}` / `{"...","keys":[...]}`); `render`
//! takes the array key + the columns to show and prints an aligned table.
//! `render_object` is for single-object responses (create/upsert results).

use serde_json::Value;

/// Print either pretty JSON (when `as_json`) or an aligned table built from
/// `response[array_key]` using `columns`.
pub fn render(response: &Value, as_json: bool, array_key: &str, columns: &[&str]) {
    if as_json {
        print_json(response);
        return;
    }

    let rows = match response.get(array_key).and_then(Value::as_array) {
        Some(rows) => rows,
        None => {
            // Shape we didn't expect — fall back to raw JSON so nothing is
            // silently dropped.
            print_json(response);
            return;
        }
    };

    if rows.is_empty() {
        println!("(no {array_key})");
        return;
    }

    // Compute column widths from headers + cell contents.
    let mut widths: Vec<usize> = columns.iter().map(|c| c.len()).collect();
    let cells: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .map(|col| cell_string(row.get(*col)))
                .collect()
        })
        .collect();
    for row in &cells {
        for (i, c) in row.iter().enumerate() {
            if c.len() > widths[i] {
                widths[i] = c.len();
            }
        }
    }

    print_row(columns.iter().map(|s| s.to_string()).collect(), &widths);
    print_row(widths.iter().map(|w| "-".repeat(*w)).collect(), &widths);
    for row in &cells {
        print_row(row.clone(), &widths);
    }
}

/// Print a single-object response. Pretty JSON with `--json`, else a
/// `key: value` block over the top-level fields.
pub fn render_object(response: &Value, as_json: bool) {
    if as_json {
        print_json(response);
        return;
    }
    match response.as_object() {
        Some(map) => {
            for (k, v) in map {
                println!("{k}: {}", cell_string(Some(v)));
            }
        }
        None => print_json(response),
    }
}

fn print_row(cells: Vec<String>, widths: &[usize]) {
    let line: Vec<String> = cells
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{:<width$}", c, width = widths.get(i).copied().unwrap_or(0)))
        .collect();
    println!("{}", line.join("  ").trim_end());
}

/// Render a JSON value as a flat cell string (no surrounding quotes on
/// strings; nested objects/arrays fall back to compact JSON).
fn cell_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => "-".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(other) => other.to_string(),
    }
}

fn print_json(value: &Value) {
    match serde_json::to_string_pretty(value) {
        Ok(s) => println!("{s}"),
        Err(_) => println!("{value}"),
    }
}
