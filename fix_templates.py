#!/usr/bin/env python3
"""
Script to fix malformed Jinja2 template variables that auto-formatters break.
Run this after your formatter messes up the templates.
"""

import re
from pathlib import Path


def fix_jinja_templates(file_path: Path) -> bool:
    """Fix malformed Jinja2 template variables in a file."""
    if not file_path.exists():
        print(f"File not found: {file_path}")
        return False

    content = file_path.read_text()
    original_content = content

    # Fix malformed template variables: { { var } } -> {{ var }}
    # This regex finds { followed by whitespace, then {, then content, then }, whitespace, then }
    # But excludes JavaScript object syntax like { html: true }
    content = re.sub(r"\{\s+\{\s*([^}:]+)\s*\}\s+\}", r"{{\1}}", content)

    # Also fix the reverse case: } } followed by { {
    content = re.sub(r"\}\s+\}\s*([^{]*)\{\s+\{", r"}}\1{{", content)

    if content != original_content:
        file_path.write_text(content)
        print(f"✅ Fixed malformed template variables in {file_path}")
        return True
    print(f"✨ No issues found in {file_path}")
    return False


def main():
    """Fix all HTML template files."""
    project_root = Path(__file__).parent
    template_files = list(project_root.glob("templates/**/*.html"))

    if not template_files:
        print("No template files found!")
        return

    fixed_count = 0
    for template_file in template_files:
        if fix_jinja_templates(template_file):
            fixed_count += 1

    if fixed_count > 0:
        print(f"\n🎉 Fixed {fixed_count} template file(s)!")
    else:
        print("\n✨ All template files are already correct!")


if __name__ == "__main__":
    main()
