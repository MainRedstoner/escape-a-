#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escape A÷ · tools/check_architecture.py —— 分层依赖检查

用途：
  在零构建、无 ESLint 的前提下，用最小静态检查守住重构后的依赖方向。
  只检查迁移中的新层目录；旧的 src/engine.js / src/art.js 等整块代码暂不判违规。

规则（默认 report-only）：
  src/domain/**       禁止 DOM / 浏览器全局 / 表现层 / 存档 UI
  src/core/**         禁止剧情、表现、音频、存档业务
  src/app/**          禁止直接调用具体表现/音频/存档实现
  src/audio/**        禁止剧情、DOM、存档
  src/persistence/**  禁止剧情、DOM、表现、音频

用法：
  python tools/check_architecture.py          # 只报告，始终 exit 0
  python tools/check_architecture.py --strict # 有违规时 exit 1（阶段 4 起进 CI）

这是结构性检查，不替代 check_js.py / validate_script.py / 人工实测。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 每个目录的禁止标识符。只匹配明确的对象访问 / DOM API，避免误伤注释和普通单词。
RULES = {
    "src/domain": [
        ("DOM", re.compile(r"\b(document|window|localStorage|sessionStorage|fetch)\b")),
        ("表现层", re.compile(r"\b(ART|AUDIO|SAVE|SCRIPT|ENGINE)\s*\.")),
        ("DOM id", re.compile(r"\bgetElementById\b|\bquerySelector\b")),
    ],
    "src/core": [
        ("剧情/表现业务", re.compile(r"\b(SYS|ART|AUDIO|SAVE|SCRIPT|ENGINE)\s*\.")),
    ],
    "src/app": [
        ("具体实现", re.compile(r"\b(SYS|ART|AUDIO|SAVE|SCRIPT)\s*\.")),
    ],
    "src/audio": [
        ("剧情/DOM/存档", re.compile(r"\b(document|window|localStorage|SYS|SCRIPT|ART|SAVE)\b|\bgetElementById\b")),
    ],
    "src/persistence": [
        ("剧情/DOM/表现/音频", re.compile(r"\b(document|window|SYS|SCRIPT|ART|AUDIO)\b|\bgetElementById\b")),
    ],
}

# 这些文件/目录是迁移前的旧实现，暂不纳入分层检查。
LEGACY = {
    "src/engine.js",
    "src/art.js",
    "src/audio.js",
    "src/pet.js",
    "src/save.js",
    "src/systems.js",
    "src/token-choice.js",
    "src/script.js",
    "src/script_ch2.js",
}


def comment_stripped(text: str) -> str:
    """去掉 // 与 /* */ 注释，保留字符串（足够做本检查的粗过滤）。"""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(?m)//.*$", "", text)
    return text


def scan_file(path: Path) -> list[tuple[int, str, str]]:
    """返回 [(行号, 规则名, 命中片段)]。"""
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []
    text = comment_stripped(raw)
    rel_parent = path.parent.relative_to(ROOT).as_posix()
    found: list[tuple[int, str, str]] = []
    for line_no, line in enumerate(text.splitlines(), 1):
        for name, rx in RULES.get(rel_parent, []):
            m = rx.search(line)
            if m:
                found.append((line_no, name, m.group(0)))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 Escape A÷ 的分层依赖")
    parser.add_argument("--strict", action="store_true", help="有违规时返回 1；默认只报告")
    args = parser.parse_args()

    scanned = 0
    violations: list[tuple[Path, int, str, str]] = []

    for rel_dir, _rules in RULES.items():
        base = ROOT / rel_dir
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.js")):
            rel = path.relative_to(ROOT).as_posix()
            if rel in LEGACY:
                continue
            scanned += 1
            for line_no, rule, snippet in scan_file(path):
                violations.append((path, line_no, rule, snippet))

    print("Escape A÷ · 分层依赖检查")
    print(f"扫描新层文件：{scanned}")
    if not violations:
        print("结果：0 违规")
        return 0

    print(f"结果：{len(violations)} 处待处理")
    for path, line_no, rule, snippet in violations:
        print(f"  {path.relative_to(ROOT).as_posix()}:{line_no}  [{rule}]  {snippet}")
    print("\n说明：阶段 0–3 为 report-only；阶段 4 起用 --strict 进 CI。")
    return 1 if args.strict else 0


if __name__ == "__main__":
    sys.exit(main())
