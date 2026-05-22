"""Generate QuizGen.pptx — pitch deck for the QuizGen project."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

# ─── Palette ─────────────────────────────────────────────────────────────────
BLUE_DARK  = RGBColor(0x1E, 0x3A, 0x8A)
BLUE       = RGBColor(0x25, 0x63, 0xEB)
BLUE_LIGHT = RGBColor(0xDB, 0xEA, 0xFE)
BLUE_BG    = RGBColor(0xEF, 0xF6, 0xFF)
SLATE_900  = RGBColor(0x0F, 0x17, 0x2A)
SLATE_700  = RGBColor(0x33, 0x41, 0x55)
SLATE_500  = RGBColor(0x64, 0x74, 0x8B)
SLATE_300  = RGBColor(0xCB, 0xD5, 0xE1)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
GREEN      = RGBColor(0x16, 0xA3, 0x4A)

FONT = "Segoe UI"
MONO = "Consolas"

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height
BLANK = prs.slide_layouts[6]


def add_slide():
    s = prs.slides.add_slide(BLANK)
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
    bg.line.fill.background()
    bg.fill.solid()
    bg.fill.fore_color.rgb = WHITE
    bg.shadow.inherit = False
    return s


def add_rect(slide, x, y, w, h, fill, line=None, shape=MSO_SHAPE.RECTANGLE):
    shp = slide.shapes.add_shape(shape, x, y, w, h)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(0.75)
    shp.shadow.inherit = False
    return shp


def _split_bold(s):
    """'foo **bar** baz' → [('foo ',False),('bar',True),(' baz',False)]"""
    parts, buf, bold = [], "", False
    i = 0
    while i < len(s):
        if s[i:i + 2] == "**":
            if buf:
                parts.append((buf, bold))
                buf = ""
            bold = not bold
            i += 2
        else:
            buf += s[i]
            i += 1
    if buf:
        parts.append((buf, bold))
    return parts or [("", False)]


def add_text(slide, x, y, w, h, text, *, size=18, bold=False, color=SLATE_700,
             font=FONT, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             line_spacing=1.2):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    tf.vertical_anchor = anchor
    for i, line in enumerate(text.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        for seg, seg_bold in _split_bold(line):
            r = p.add_run()
            r.text = seg
            r.font.name = font
            r.font.size = Pt(size)
            r.font.bold = bold or seg_bold
            r.font.color.rgb = SLATE_900 if (seg_bold and not bold) else color
    return tb


def add_bullets(slide, x, y, w, h, items, *, size=18, color=SLATE_700,
                bullet_color=BLUE, line_spacing=1.3, marker="▍"):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.line_spacing = line_spacing
        p.space_after = Pt(6)
        br = p.add_run()
        br.text = f"{marker}  "
        br.font.name = FONT
        br.font.size = Pt(size)
        br.font.bold = True
        br.font.color.rgb = bullet_color
        for seg, is_bold in _split_bold(item):
            r = p.add_run()
            r.text = seg
            r.font.name = FONT
            r.font.size = Pt(size)
            r.font.bold = is_bold
            r.font.color.rgb = SLATE_900 if is_bold else color
    return tb


def header(slide, title, subtitle=None):
    add_rect(slide, Inches(0.6), Inches(0.55), Inches(0.18), Inches(0.55), BLUE)
    add_text(slide, Inches(0.95), Inches(0.45), Inches(11.5), Inches(0.7),
             title, size=30, bold=True, color=BLUE_DARK,
             anchor=MSO_ANCHOR.MIDDLE)
    if subtitle:
        add_text(slide, Inches(0.95), Inches(1.05), Inches(11.5), Inches(0.4),
                 subtitle, size=15, color=SLATE_500)
    add_rect(slide, Inches(0.6), Inches(1.55), Inches(12.1), Emu(12700), SLATE_300)


def footer(slide, page=None, total=None):
    add_text(slide, Inches(0.6), Inches(7.1), Inches(8), Inches(0.3),
             "QuizGen · СберХакатон 2026", size=10, color=SLATE_500)
    if page is not None:
        add_text(slide, Inches(11.5), Inches(7.1), Inches(1.5), Inches(0.3),
                 f"{page} / {total}", size=10, color=SLATE_500,
                 align=PP_ALIGN.RIGHT)


def tag(slide, x, y, text, *, fill=BLUE_LIGHT, color=BLUE_DARK, size=12):
    w = Inches(0.11 * len(text) + 0.4)
    h = Inches(0.35)
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    shp.adjustments[0] = 0.5
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    shp.line.fill.background()
    shp.shadow.inherit = False
    tf = shp.text_frame
    tf.margin_left = Inches(0.1)
    tf.margin_right = Inches(0.1)
    tf.margin_top = Emu(0)
    tf.margin_bottom = Emu(0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = text
    r.font.name = FONT
    r.font.size = Pt(size)
    r.font.bold = True
    r.font.color.rgb = color
    return x + w + Inches(0.1)


def mono_block(slide, x, y, w, h, text):
    box = add_rect(slide, x, y, w, h, SLATE_900)
    tf = box.text_frame
    tf.margin_left = Inches(0.25)
    tf.margin_right = Inches(0.25)
    tf.margin_top = Inches(0.18)
    tf.margin_bottom = Inches(0.18)
    tf.word_wrap = False
    for i, line in enumerate(text.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.line_spacing = 1.05
        r = p.add_run()
        r.text = line if line else " "
        r.font.name = MONO
        r.font.size = Pt(11)
        r.font.color.rgb = BLUE_LIGHT
    return box


def styled_table(slide, x, y, w, h, headers, rows, col_widths=None):
    tbl_shape = slide.shapes.add_table(len(rows) + 1, len(headers), x, y, w, h)
    tbl = tbl_shape.table
    if col_widths:
        for i, cw in enumerate(col_widths):
            tbl.columns[i].width = cw
    for i, htxt in enumerate(headers):
        cell = tbl.cell(0, i)
        cell.fill.solid()
        cell.fill.fore_color.rgb = BLUE
        cell.text_frame.clear()
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run()
        r.text = htxt
        r.font.name = FONT
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = WHITE
        cell.margin_left = Inches(0.18)
        cell.margin_right = Inches(0.18)
        cell.margin_top = Inches(0.08)
        cell.margin_bottom = Inches(0.08)
    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            cell = tbl.cell(ri, ci)
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE if ri % 2 else BLUE_BG
            cell.text_frame.clear()
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            for seg, is_bold in _split_bold(val):
                r = p.add_run()
                r.text = seg
                r.font.name = FONT
                r.font.size = Pt(13)
                r.font.bold = is_bold
                r.font.color.rgb = SLATE_900 if is_bold else SLATE_700
            cell.margin_left = Inches(0.18)
            cell.margin_right = Inches(0.18)
            cell.margin_top = Inches(0.06)
            cell.margin_bottom = Inches(0.06)
    return tbl


# ═══════════════════════════════════════════════════════════════════════════════
# 1. TITLE
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
add_rect(s, 0, 0, Inches(4.4), SH, BLUE_DARK)
add_rect(s, Inches(4.4), 0, Inches(0.12), SH, BLUE)

add_rect(s, Inches(0.8), Inches(0.9), Inches(2.8), Inches(2.8), BLUE)
add_text(s, Inches(0.8), Inches(0.9), Inches(2.8), Inches(2.8),
         "QG", size=120, bold=True, color=WHITE,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

add_text(s, Inches(0.8), Inches(4.05), Inches(3.2), Inches(0.4),
         "СБЕРХАКАТОН 2026", size=13, bold=True, color=BLUE_LIGHT)
add_text(s, Inches(0.8), Inches(4.45), Inches(3.2), Inches(0.4),
         "MVP · Pitch deck", size=13, color=BLUE_LIGHT)

add_text(s, Inches(5.0), Inches(1.7), Inches(8), Inches(1.2),
         "QuizGen", size=72, bold=True, color=BLUE_DARK)
add_text(s, Inches(5.0), Inches(2.8), Inches(8), Inches(0.6),
         "AI-генератор викторин для учителей", size=24, color=SLATE_700)

add_rect(s, Inches(5.0), Inches(3.7), Inches(0.7), Inches(0.06), BLUE)

add_text(s, Inches(5.0), Inches(4.0), Inches(8), Inches(1.6),
         "Загружаешь учебный материал —\nGigaChat генерирует квиз.\n"
         "Ученики проходят его по ссылке.\nУчитель получает аналитику.",
         size=18, color=SLATE_500, line_spacing=1.3)

x = Inches(5.0)
y = Inches(6.0)
for t in ["Go 1.22", "React 18", "PostgreSQL", "GigaChat", "Docker"]:
    x = tag(s, x, y, t, size=13)

footer(s)

# ═══════════════════════════════════════════════════════════════════════════════
# 2. PROBLEM
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Проблема", "Почему учителям нужен новый инструмент")

add_bullets(s, Inches(0.95), Inches(2.0), Inches(11.4), Inches(4),
            [
                "Учителя тратят **часы** на составление контрольных и проверок по каждому новому материалу.",
                "Готовые сервисы (Kahoot, Quizlet) требуют **ручного ввода** вопросов и ответов.",
                "Нет связки «материал → квиз → аналитика по классу» в **один клик**.",
                "Антишпаргалка и индивидуальные ссылки — **отдельная боль** на стороне учителя.",
            ], size=20, line_spacing=1.5)

cx, cy, cw, ch = Inches(0.95), Inches(5.7), Inches(11.4), Inches(1)
add_rect(s, cx, cy, cw, ch, BLUE_BG)
add_rect(s, cx, cy, Inches(0.12), ch, BLUE)
add_text(s, cx + Inches(0.35), cy, cw - Inches(0.5), ch,
         "Нужно: загрузил PDF — получил готовый квиз с разбором и статистикой.",
         size=18, bold=True, color=BLUE_DARK, anchor=MSO_ANCHOR.MIDDLE)

footer(s, 2, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 3. SOLUTION
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Решение — QuizGen", "Закрываем весь цикл: создание → раздача → аналитика")

cx1, cy1, cw1, ch1 = Inches(0.95), Inches(2.0), Inches(5.7), Inches(4.2)
add_rect(s, cx1, cy1, cw1, ch1, BLUE_BG)
add_rect(s, cx1, cy1, cw1, Inches(0.55), BLUE)
add_text(s, cx1 + Inches(0.3), cy1, cw1, Inches(0.55),
         "Для учителя", size=18, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
add_bullets(s, cx1 + Inches(0.3), cy1 + Inches(0.8), cw1 - Inches(0.5), ch1 - Inches(1),
            [
                "Генерация из **PDF / DOCX / PPTX / TXT / MD**",
                "Настройка сложности, тона, уровня Блума",
                "Персональные ссылки и **QR**",
                "Полная аналитика и **CSV-экспорт**",
                "Печатная версия — с ключом или без",
            ], size=15, line_spacing=1.4)

cx2 = Inches(7.05)
add_rect(s, cx2, cy1, cw1, ch1, BLUE_BG)
add_rect(s, cx2, cy1, cw1, Inches(0.55), BLUE_DARK)
add_text(s, cx2 + Inches(0.3), cy1, cw1, Inches(0.55),
         "Для ученика", size=18, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
add_bullets(s, cx2 + Inches(0.3), cy1 + Inches(0.8), cw1 - Inches(0.5), ch1 - Inches(1),
            [
                "Открыть ссылку с телефона или **QR**",
                "Представиться по имени",
                "Пройти квиз с **прогресс-баром**",
                "Получить процент правильных",
                "Антишпаргалка работает **в фоне**",
            ], size=15, line_spacing=1.4)

x = Inches(0.95)
y = Inches(6.5)
for t in ["PDF→Quiz", "QR-ссылки", "Антишпаргалка", "CSV-экспорт", "Печать"]:
    x = tag(s, x, y, t, size=12)

footer(s, 3, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 4. TEACHER FLOW
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Флоу учителя", "От регистрации до раздачи квиза за минуту")

steps = [
    ("1", "Регистрация",  "Email + пароль →\nJWT-токен."),
    ("2", "Создать квиз", "Тема, класс,\nсложность, тон.\nМожно прикрепить файл."),
    ("3", "Генерация",    "GigaChat возвращает\nJSON, сохраняется\nв Postgres."),
    ("4", "Редактор",     "Правка вопросов,\nперегенерация одного\nвопроса отдельно."),
    ("5", "Publish",      "Персональные ссылки\nи QR-коды для\nкаждого ученика."),
]

n = len(steps)
gap = Inches(0.18)
total_w = Inches(12.2)
card_w = Emu(int((total_w - gap * (n - 1)) / n))
card_h = Inches(4.4)
y0 = Inches(2.1)
x0 = Inches(0.55)

for i, (num, title, body) in enumerate(steps):
    x = x0 + Emu(int(card_w + gap) * i)
    add_rect(s, x, y0, card_w, card_h, BLUE_BG)
    add_rect(s, x, y0, card_w, Inches(0.08), BLUE)
    # circle
    cd = Inches(0.85)
    add_rect(s, x + Inches(0.2), y0 + Inches(0.35), cd, cd, BLUE, shape=MSO_SHAPE.OVAL)
    add_text(s, x + Inches(0.2), y0 + Inches(0.35), cd, cd,
             num, size=28, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, x + Inches(0.2), y0 + Inches(1.4), card_w - Inches(0.4), Inches(0.5),
             title, size=16, bold=True, color=BLUE_DARK)
    add_text(s, x + Inches(0.2), y0 + Inches(1.95), card_w - Inches(0.4), card_h - Inches(2.2),
             body, size=12, color=SLATE_700, line_spacing=1.3)

# bottom arrow
y_arr = y0 + card_h + Inches(0.25)
add_rect(s, Inches(0.55), y_arr, Inches(12.2), Inches(0.04), BLUE_LIGHT)

footer(s, 4, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 5. STUDENT FLOW + ANTI-CHEAT
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Флоу ученика и антишпаргалка", "Прохождение и защита от списывания")

add_text(s, Inches(0.95), Inches(2.0), Inches(6), Inches(0.5),
         "Что видит ученик", size=18, bold=True, color=BLUE_DARK)
add_bullets(s, Inches(0.95), Inches(2.6), Inches(6), Inches(4),
            [
                "Открывает **/play/:token** или сканирует QR.",
                "Вводит фамилию и имя — учитель будет знать, кто проходил.",
                "Отвечает: single / multiple / true-false.",
                "**Прогресс-бар** и мобильная адаптивность.",
                "Финальный экран с процентом правильных.",
            ], size=15, line_spacing=1.4)

add_text(s, Inches(7.4), Inches(2.0), Inches(5.5), Inches(0.5),
         "Что делает антишпаргалка", size=18, bold=True, color=BLUE_DARK)
add_bullets(s, Inches(7.4), Inches(2.6), Inches(5.5), Inches(4),
            [
                "**blur + visibilitychange** — детект перехода вкладок.",
                "Блок **copy / cut / paste / contextmenu**.",
                "**Счётчик нарушений** уходит на бэк.",
                "Учитель видит количество переключений в отчёте.",
                "Предупреждение появляется прямо в квизе.",
            ], size=15, line_spacing=1.4, bullet_color=BLUE_DARK)

footer(s, 5, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 6. ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Аналитика для учителя", "Сразу видно, какие темы провалил класс")

cards = [
    ("Гистограмма",      "Распределение баллов\nпо группе"),
    ("Таблица учеников", "Имя, балл, статус,\nчисло нарушений"),
    ("Детали попытки",   "Что выбрал ученик и\nкакие ответы правильные"),
    ("CSV-экспорт",      "UTF-8 + BOM —\nоткроется в Excel"),
    ("Печать квиза",     "С ключом ответов\nили без"),
]

n = len(cards)
gap = Inches(0.2)
total_w = Inches(12.2)
card_w = Emu(int((total_w - gap * (n - 1)) / n))
card_h = Inches(2.6)
y0 = Inches(2.2)
x0 = Inches(0.55)

for i, (title, body) in enumerate(cards):
    x = x0 + Emu(int(card_w + gap) * i)
    add_rect(s, x, y0, card_w, card_h, BLUE_BG)
    add_rect(s, x, y0, Inches(0.08), card_h, BLUE)
    add_text(s, x + Inches(0.25), y0 + Inches(0.3), card_w - Inches(0.4), Inches(0.5),
             title, size=16, bold=True, color=BLUE_DARK)
    add_text(s, x + Inches(0.25), y0 + Inches(0.95), card_w - Inches(0.4), card_h - Inches(1.1),
             body, size=12, color=SLATE_700, line_spacing=1.3)

# Quote
qy = Inches(5.4)
add_rect(s, Inches(0.95), qy, Inches(11.4), Inches(1.1), BLUE_DARK)
add_text(s, Inches(1.3), qy, Inches(11), Inches(1.1),
         "«Учитель сразу видит, какие темы провалил класс — не точечно отдельный ученик».",
         size=18, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.3)

footer(s, 6, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 7. TECH STACK
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Технологический стек", "Современный, проверенный, ничего лишнего")

rows = [
    ["**Backend**",  "Go 1.22 · Gin · golang-migrate · lib/pq"],
    ["**Database**", "PostgreSQL 16"],
    ["**LLM**",      "GigaChat (Sber) — OAuth + REST · fallback: Anthropic / OpenAI"],
    ["**Frontend**", "React 18 · TypeScript · Vite · TailwindCSS · React Router"],
    ["**Charts**",   "Recharts"],
    ["**QR**",       "qrcode.react"],
    ["**Парсинг**",  "pdfcpu · archive/zip + XML (DOCX/PPTX)"],
    ["**DevOps**",   "Docker · docker-compose (multi-stage build)"],
]
styled_table(s, Inches(0.95), Inches(1.95), Inches(11.4), Inches(4.8),
             ["Слой", "Технологии"], rows,
             col_widths=[Inches(2.4), Inches(9.0)])

footer(s, 7, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 8. ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Архитектура", "Слоистая: Handlers → Services → Repositories")

diagram = """┌──────────────┐      HTTPS       ┌──────────────────────┐
│   Browser    │ ───────────────► │   Go (Gin) :8080     │
│  (React SPA) │                  │  ┌────────────────┐  │
└──────────────┘                  │  │   Handlers     │  │
                                  │  └────────┬───────┘  │
                                  │  ┌────────▼───────┐  │     ┌─────────────┐
                                  │  │   Services     │──┼────►│  GigaChat   │
                                  │  └────────┬───────┘  │     │  (LLM API)  │
                                  │  ┌────────▼───────┐  │     └─────────────┘
                                  │  │ Repositories   │  │
                                  │  └────────┬───────┘  │
                                  └───────────┼──────────┘
                                  ┌───────────▼──────────┐
                                  │   PostgreSQL :5432   │
                                  └──────────────────────┘"""

mono_block(s, Inches(0.95), Inches(2.0), Inches(11.4), Inches(4.3), diagram)

add_text(s, Inches(0.95), Inches(6.5), Inches(11.4), Inches(0.5),
         "Чисто разделено: HTTP-роутинг, бизнес-логика, доступ к данным. Меняется в одиночку, тестируется в одиночку.",
         size=14, color=SLATE_500)

footer(s, 8, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 9. LLM INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "LLM-интеграция (GigaChat)", "Промпт-инжиниринг, парсинг JSON, санитайзинг")

add_bullets(s, Inches(0.95), Inches(2.0), Inches(11.4), Inches(4.5),
            [
                "**OAuth flow**: получаем токен по Authorization-Key, кешируем до expires_at.",
                "**Жёсткий промпт**: явная JSON-схема, правила для каждого типа вопроса, поддержка таксономии Блума.",
                "**Парсинг ответа**: срезаем ```json``` обёртки, чиним «висячие» запятые stripTrailingCommas.",
                "**sanitizeUTF8**: маппим Windows-1252 → UTF-8, выкидываем NUL-байты — иначе Postgres ругается.",
                "**Перегенерация одного вопроса**: отдельный промпт с контекстом и «избегай вот этой формулировки».",
                "**Провайдер абстрагирован**: можно переключить на Anthropic или OpenAI одной переменной окружения.",
            ], size=16, line_spacing=1.5)

footer(s, 9, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 10. FILE PARSING
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Парсинг исходных материалов", "Учитель прикрепляет файл — извлекаем чистый текст")

styled_table(s, Inches(0.95), Inches(2.0), Inches(11.4), Inches(2.8),
             ["Формат", "Метод"],
             [
                 ["**PDF**",    "pdfcpu — извлечение текстового слоя"],
                 ["**DOCX**",   "archive/zip → word/document.xml → парсинг"],
                 ["**PPTX**",   "archive/zip → ppt/slides/*.xml → парсинг"],
                 ["**TXT/MD**", "Прямое чтение"],
             ], col_widths=[Inches(2.2), Inches(9.2)])

add_bullets(s, Inches(0.95), Inches(5.2), Inches(11.4), Inches(1.8),
            [
                "Лимит размера: **10 МБ** (настраивается MAX_UPLOAD_SIZE_MB).",
                "Текст обрезается до **6000 символов** для промпта.",
                "Все тексты прогоняются через **sanitizeUTF8** перед записью в БД.",
            ], size=15, line_spacing=1.4)

footer(s, 10, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 11. SECURITY
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Безопасность", "JWT, rate-limit, антишпаргалка, санитайзинг")

items = [
    ("JWT (HMAC-SHA256)",
     "Подписаны APP_SECRET_KEY длиной 32+ символов. Срок жизни конфигурируется."),
    ("Middleware Auth",
     "Проверяет и валидность подписи, и существование пользователя в БД (защита от висячих сессий)."),
    ("Rate-limit",
     "RATE_LIMIT_REQUESTS генераций в час на юзера — защита от слива квоты LLM."),
    ("Антишпаргалка",
     "visibility API + блокировка копипаста, счётчик нарушений уходит на бэк."),
    ("Санитайзинг данных",
     "UTF-8 и NUL-байты чистятся перед записью — LLM не положит Postgres."),
]
y0 = Inches(2.0)
for i, (title, body) in enumerate(items):
    y = y0 + Inches(0.9 * i)
    add_rect(s, Inches(0.95), y, Inches(0.08), Inches(0.75), BLUE)
    add_text(s, Inches(1.2), y, Inches(3.5), Inches(0.4),
             title, size=15, bold=True, color=BLUE_DARK)
    add_text(s, Inches(1.2), y + Inches(0.4), Inches(11.2), Inches(0.4),
             body, size=13, color=SLATE_700)

footer(s, 11, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 12. PROJECT STRUCTURE
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Структура проекта", "Чистая Go-раскладка, фронт отдельно")

tree = """.
├── cmd/server/        # точка входа
├── internal/
│   ├── config/        # .env → struct
│   ├── db/            # коннект + миграции
│   ├── handlers/      # HTTP (Gin)
│   ├── middleware/    # Auth, RateLimit
│   ├── models/        # доменка + DTO
│   ├── parser/        # PDF / DOCX / PPTX → text
│   ├── repository/    # SQL
│   └── service/       # бизнес-логика + LLM
├── migrations/        # SQL
├── frontend/          # React SPA (Vite)
├── Dockerfile         # multi-stage: node → go → alpine
└── docker-compose.yaml"""

mono_block(s, Inches(0.95), Inches(2.0), Inches(7.5), Inches(4.7), tree)

# Right panel: deploy
rx, ry, rw, rh = Inches(8.7), Inches(2.0), Inches(3.7), Inches(4.7)
add_rect(s, rx, ry, rw, rh, BLUE_BG)
add_rect(s, rx, ry, rw, Inches(0.5), BLUE)
add_text(s, rx + Inches(0.25), ry, rw, Inches(0.5),
         "Запуск", size=15, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
add_text(s, rx + Inches(0.25), ry + Inches(0.7), rw - Inches(0.5), Inches(3.5),
         "1. cp .env.example .env\n"
         "2. Вписать LLM_API_KEY\n"
         "3. docker compose up -d\n\n"
         "→ http://localhost:8080\n\n"
         "Контейнер сам прогоняет\n"
         "миграции при старте.",
         size=13, color=SLATE_700, line_spacing=1.4)

footer(s, 12, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 13. MVP CHECKLIST
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Что уже работает", "MVP-чеклист")

done = [
    "Регистрация и логин учителя (JWT)",
    "Генерация квиза из текста или файла (PDF/DOCX/PPTX/TXT/MD)",
    "Тонкая настройка: сложность, тон, Блум, типы вопросов",
    "Редактор квиза + перегенерация одного вопроса",
    "Персональные ссылки + QR-коды",
    "Печатная версия — с ключом ответов и без",
    "Прохождение учеником + антишпаргалка",
    "Статистика: гистограмма, таблица, разбор попытки",
    "CSV-экспорт (Excel-friendly)",
    "Docker-развёртка одной командой",
]

# Two columns of checks
half = (len(done) + 1) // 2
for col, items in enumerate([done[:half], done[half:]]):
    x = Inches(0.95 + col * 6.0)
    for i, item in enumerate(items):
        y = Inches(2.0 + i * 0.5)
        add_rect(s, x, y + Inches(0.06), Inches(0.32), Inches(0.32), GREEN,
                 shape=MSO_SHAPE.OVAL)
        add_text(s, x, y + Inches(0.06), Inches(0.32), Inches(0.32),
                 "✓", size=14, bold=True, color=WHITE,
                 align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        add_text(s, x + Inches(0.5), y, Inches(5.4), Inches(0.45),
                 item, size=14, color=SLATE_700, anchor=MSO_ANCHOR.MIDDLE)

footer(s, 13, 14)

# ═══════════════════════════════════════════════════════════════════════════════
# 14. ROADMAP + THANKS
# ═══════════════════════════════════════════════════════════════════════════════
s = add_slide()
header(s, "Что дальше", "Roadmap после хакатона")

add_bullets(s, Inches(0.95), Inches(2.0), Inches(11.4), Inches(3.5),
            [
                "**Адаптивная сложность** — следующий вопрос зависит от предыдущих.",
                "**Банк вопросов** учителя — переиспользование между квизами.",
                "**Классы и группы** — назначение квизов на список учеников.",
                "**Динамика по ученику** — прогресс по неделям и месяцам.",
                "**SSO** через школьные ID-провайдеры.",
                "**PWA / нативное приложение** для учеников.",
            ], size=16, line_spacing=1.45)

# Thanks card
ty, th_ = Inches(5.7), Inches(1.5)
add_rect(s, Inches(0.95), ty, Inches(11.4), th_, BLUE_DARK)
add_text(s, Inches(0.95), ty, Inches(11.4), Inches(0.6),
         "Спасибо!", size=28, bold=True, color=WHITE,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
add_text(s, Inches(0.95), ty + Inches(0.6), Inches(11.4), Inches(0.5),
         "QuizGen — викторины за минуту, аналитика за секунду.",
         size=16, color=BLUE_LIGHT,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
add_text(s, Inches(0.95), ty + Inches(1.05), Inches(11.4), Inches(0.4),
         "docker compose up -d   →   http://localhost:8080",
         size=13, font=MONO, color=BLUE_LIGHT,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

footer(s, 14, 14)

# ─── Save ────────────────────────────────────────────────────────────────────
out = "QuizGen.pptx"
prs.save(out)
print(f"Saved: {out} ({len(prs.slides)} slides)")
