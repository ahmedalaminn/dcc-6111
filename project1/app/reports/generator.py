# Generates HTML engineering reports from stored metrics and comparison data.
# Uses Jinja2 to render report.html — nothing fancy, just fills in the template.

import csv
import json
import os
import time

from jinja2 import Environment, FileSystemLoader


def generate_report(data_dir, templates_dir, source_id=None, comparison_id=None):
    env = Environment(loader=FileSystemLoader(templates_dir), autoescape=True)
    template = env.get_template("report.html")

    report_data = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "source_id": source_id,
        "comparison_id": comparison_id,
        "metrics_history": [],
        "comparison": None,
    }

    # Pull metric history from the source's CSV if it exists
    if source_id:
        metrics_file = os.path.join(data_dir, "metrics", f"{source_id}_metrics.csv")
        if os.path.exists(metrics_file):
            with open(metrics_file, newline="") as f:
                report_data["metrics_history"] = list(csv.DictReader(f))

    # Attach the comparison JSON if requested
    if comparison_id:
        cmp_file = os.path.join(data_dir, "comparisons", f"{comparison_id}.json")
        if os.path.exists(cmp_file):
            with open(cmp_file) as f:
                report_data["comparison"] = json.load(f)

    html = template.render(**report_data)

    reports_dir = os.path.join(data_dir, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    filepath = os.path.join(reports_dir, f"report_{int(time.time() * 1000)}.html")
    with open(filepath, "w") as f:
        f.write(html)

    return filepath
