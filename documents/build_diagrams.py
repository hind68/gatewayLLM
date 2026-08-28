#!/usr/bin/env python3
"""Genere les diagrammes (PNG haute resolution) inseres dans DAT.docx.

Utilise matplotlib (boites + fleches) plutot qu'un outil externe (aucun
plantuml/mermaid/graphviz disponible dans l'environnement). Toutes les
donnees dessinees ici doivent correspondre exactement au code reel du
projet (voir CLAUDE.md).
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.path import Path as MplPath
from pathlib import Path

OUT = Path(__file__).resolve().parent / "diagrams"
OUT.mkdir(exist_ok=True)

NAVY = "#1B2A4A"
ACCENT = "#2E6F9E"
LIGHT = "#EAF1F8"
GREY = "#595959"
WARN = "#B23A48"
GREEN = "#2E7D4F"
WHITE = "#FFFFFF"


def box(ax, x, y, w, h, text, fc=LIGHT, ec=NAVY, fontsize=10, fontweight="bold", textcolor=NAVY, lw=1.6, style="round,pad=0.02,rounding_size=0.02"):
    b = FancyBboxPatch((x, y), w, h, boxstyle=style, linewidth=lw,
                        edgecolor=ec, facecolor=fc, zorder=2)
    ax.add_patch(b)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=fontsize, fontweight=fontweight, color=textcolor, zorder=3, wrap=True)
    return (x, y, w, h)


def arrow(ax, p1, p2, text=None, color=GREY, style="-|>", ls="-", lw=1.4, curve=0.0, fontsize=8.5, text_offset=(0, 0.15)):
    a = FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=14,
                         color=color, linewidth=lw, linestyle=ls,
                         connectionstyle=f"arc3,rad={curve}", zorder=1)
    ax.add_patch(a)
    if text:
        mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
        ax.text(mx + text_offset[0], my + text_offset[1], text, ha="center", va="center",
                fontsize=fontsize, color=color, zorder=4,
                bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.85))


def new_fig(w, h):
    fig, ax = plt.subplots(figsize=(w, h), dpi=220)
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.axis("off")
    return fig, ax


def save(fig, name):
    path = OUT / name
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("saved", path)
    return path


# ---------------------------------------------------------------------------
# 1. Global architecture diagram
# ---------------------------------------------------------------------------

def build_global_architecture():
    fig, ax = new_fig(13, 9)

    box(ax, 5.0, 7.6, 3.0, 0.9, "Navigateur\nReact / Vite (SPA)\nport 5173", fc=LIGHT, fontsize=9.5)

    box(ax, 0.5, 5.7, 3.0, 1.0, "Keycloak\n(auth OIDC)\nport 8080", fc="#F3E9DC", ec="#9C6B1F", fontsize=9)

    box(ax, 5.0, 5.6, 3.0, 1.1, "Backend Spring Boot\n(API REST + SSE)\nport 8081/api", fc=LIGHT, fontsize=9.5)

    box(ax, 9.5, 5.7, 3.0, 1.0, "Service DLP\nFastAPI (Presidio)\nport 8000", fc="#E9F3EA", ec=GREEN, fontsize=9)

    box(ax, 5.0, 3.6, 3.0, 1.0, "LiteLLM Proxy\nport 4000", fc="#EAF1F8", ec=ACCENT, fontsize=9.5)

    box(ax, 0.5, 3.6, 3.0, 1.0, "PostgreSQL\n(app)\nport 5433->5432", fc="#F5EEF7", ec="#6B3FA0", fontsize=9)

    box(ax, 9.5, 3.6, 3.0, 1.0, "PostgreSQL\n(Keycloak)\ninterne", fc="#F5EEF7", ec="#6B3FA0", fontsize=9)

    box(ax, 5.0, 1.4, 6.5, 1.0, "Fournisseurs LLM externes\nOpenAI / Groq / Gemini / Mistral (Anthropic pret, desactive)",
        fc="#FCEFEF", ec=WARN, fontsize=9)

    # arrows
    arrow(ax, (6.0, 7.6), (6.0, 6.7), "HTTPS REST + SSE\n(JWT Bearer)")
    arrow(ax, (5.0, 8.0), (3.5, 6.7), "Redirect login\nAuthorization Code + PKCE", curve=-0.15, fontsize=8)
    arrow(ax, (3.5, 6.2), (5.0, 6.2), "Validation JWT\n(JWKS)", fontsize=8)
    arrow(ax, (8.0, 6.15), (9.5, 6.2), "Analyse texte / fichiers\n(REST)", fontsize=8)
    arrow(ax, (2.0, 5.7), (2.0, 4.6), "OAuth2 realm 'synapse'", curve=0.2, fontsize=8)
    arrow(ax, (6.5, 5.6), (6.5, 4.6), "Appel modele\n(WebClient)", fontsize=8)
    arrow(ax, (2.0, 5.6), (2.0, 5.5))
    arrow(ax, (3.5, 4.1), (5.0, 5.9), "JPA (Flyway)", curve=0.2, fontsize=8)
    arrow(ax, (11.0, 5.7), (11.0, 4.6))
    arrow(ax, (6.5, 3.6), (7.5, 2.4), "Appel provider\n(cle API)", curve=-0.1, fontsize=8)

    ax.text(6.5, 8.85, "Architecture globale — Secure LLM Gateway", ha="center", fontsize=13,
            fontweight="bold", color=NAVY)
    return save(fig, "architecture_globale.png")


# ---------------------------------------------------------------------------
# 2. Entity relationship diagram (from verified migration research)
# ---------------------------------------------------------------------------

def erd_table(ax, x, y, w, title, rows, header_color=NAVY):
    row_h = 0.32
    h = 0.4 + row_h * len(rows)
    box(ax, x, y, w, 0.4, title, fc=header_color, ec=header_color, fontsize=9.5,
        textcolor="white", style="round,pad=0.01,rounding_size=0.01")
    ry = y - row_h
    for r in rows:
        b = FancyBboxPatch((x, ry), w, row_h, boxstyle="square,pad=0", linewidth=0.8,
                            edgecolor="#B5B5B5", facecolor="white", zorder=2)
        ax.add_patch(b)
        ax.text(x + 0.1, ry + row_h / 2, r, ha="left", va="center", fontsize=7.3, color="#222", zorder=3)
        ry -= row_h
    return y - h, y  # bottom, top


def build_erd():
    fig, ax = new_fig(19, 17)

    # Row A (top, y=15): fournisseur_llm, modele_llm, utilisateur
    erd_table(ax, 0.8, 15.6, 3.4, "fournisseur_llm",
        ["PK id", "code (UNIQUE)", "nom", "statut", "api_key_env_var", "created_at / updated_at"])
    erd_table(ax, 7.7, 15.6, 3.6, "modele_llm",
        ["PK id", "FK fournisseur_llm_id", "alias_interne (UNIQUE)", "nom_modele_provider",
         "nom_affichage", "description, logo_url", "statut"])
    erd_table(ax, 14.6, 15.6, 3.4, "utilisateur",
        ["PK id", "external_id (UNIQUE)", "nom_affichage"])

    # Row B (y=11.7): conversation, centered under modele_llm/utilisateur
    erd_table(ax, 11.0, 11.7, 3.6, "conversation",
        ["PK id", "FK utilisateur_id", "FK modele_llm_id", "titre", "statut", "dernier_message_at"])

    # Row C (y=7): message (center), attachment (right)
    erd_table(ax, 6.6, 7.8, 4.2, "message",
        ["PK id", "FK conversation_id (CASCADE)", "FK modele_llm_id (nullable)",
         "FK reponse_a_message_id (SET NULL)", "role, ordre, statut", "contenu",
         "dlp_highest_severity", "dlp_detected_types", "dlp_matches_json / dlp_masked_text",
         "attachment_metadata_json"])
    erd_table(ax, 14.6, 9.4, 3.8, "attachment",
        ["PK id", "FK message_id (CASCADE)", "original_filename, mime_type, size",
         "storage_key", "dlp_decision", "extraction_status", "extracted/masked_text"])

    # Row D (left column, isolated tables, no FK to the rest)
    erd_table(ax, 0.8, 11.0, 3.6, "Permissions (5 tables)",
        ["user_llm_restrictions", "role_llm_restrictions", "global_banned_words",
         "user_banned_words", "role_banned_words", "(cle: UUID Keycloak, pas de FK)"])
    erd_table(ax, 0.8, 7.0, 3.6, "audit_logs",
        ["PK id", "action, entity_name, entity_id", "performed_by (UUID)", "timestamp",
         "(pas de FK)"])
    erd_table(ax, 0.8, 3.0, 3.6, "filtered_messages",
        ["PK id", "user_keycloak_id (UUID)", "original/redacted_content", "action, reason",
         "highest_severity, detected_types", "detection_count, request_status", "(pas de FK)"])

    # --- Relations (straight lines, labels placed in clear whitespace) ---
    # fournisseur_llm -> modele_llm.fournisseur_llm_id
    arrow(ax, (4.2, 15.9), (7.7, 15.9), "1..N", fontsize=9, text_offset=(0, 0.28))
    # utilisateur -> conversation.utilisateur_id
    arrow(ax, (15.6, 15.6), (13.6, 13.4), "1..N", curve=0.1, fontsize=9, text_offset=(1.0, 0.5))
    # modele_llm -> conversation.modele_llm_id
    arrow(ax, (11.2, 15.6), (12.0, 13.4), "1..N", curve=-0.1, fontsize=9, text_offset=(-0.6, 0.1))
    # modele_llm -> message.modele_llm_id (attribution reponse assistant, dashed to mark nullable/optional)
    arrow(ax, (9.2, 15.6), (8.6, 9.7), "0..N attribution reponse\n(FK nullable)", curve=-0.25, fontsize=8,
          ls="--", text_offset=(-2.1, -1.6))
    # conversation -> message.conversation_id
    arrow(ax, (11.8, 11.7), (9.8, 9.7), "1..N (CASCADE)", curve=0.1, fontsize=8.5, text_offset=(1.6, 0.85))
    # message -> attachment.message_id
    arrow(ax, (10.8, 8.9), (14.6, 10.3), "1..N (CASCADE)", curve=-0.2, fontsize=8.5, text_offset=(0.1, 0.55))

    # message self-reference (reponse_a_message_id), drawn as small loop to the right of the box
    ax.annotate("", xy=(11.4, 7.55), xytext=(11.4, 6.3),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=1.3,
                                 connectionstyle="arc3,rad=-0.6"))
    ax.text(12.55, 6.9, "reponse_a_message_id\n-> message.id\n(auto-reference, SET NULL)",
            fontsize=8, color=GREY, ha="center", style="italic")

    ax.text(9.5, 16.7, "Modele conceptuel de donnees — schema PostgreSQL (V1-V22)", ha="center",
            fontsize=15, fontweight="bold", color=NAVY)
    ax.text(9.5, 0.55,
            "Permissions / audit_logs / filtered_messages : identites par UUID Keycloak (realm externe) — aucune FK SQL vers utilisateur ou message",
            fontsize=9, color=GREY, ha="center", style="italic")
    return save(fig, "erd_donnees.png")


# ---------------------------------------------------------------------------
# 3. DLP pipeline diagram
# ---------------------------------------------------------------------------

def build_dlp_pipeline():
    W = 23.5
    fig, ax = new_fig(W, 8)

    steps = [
        "Requete entrante\n(texte / fichier)",
        "Controle taille\n(DLP_MAX_TEXT_LENGTH /\nDLP_MAX_FILE_SIZE_MB)",
        "Extraction texte\n(parsers docx/pptx/csv/\nxlsx/pdf/zip + OCR)",
        "Normalisation\n(NFKC, anti-\nobfuscation)",
        "Detection\n(regex 39 regles +\nPresidio NER + mots\nbannis)",
        "Dedup + scoring\n+ severite\n(low/medium/high)",
        "Decision\nALLOW / MASK / BLOCK",
    ]
    n = len(steps)
    w = 2.35
    gap = 0.35
    total_w = n * w + (n - 1) * gap
    start_x = (W - total_w) / 2
    y = 4.6
    h = 1.9
    xs = []
    for i, s in enumerate(steps):
        x = start_x + i * (w + gap)
        xs.append(x)
        fc = LIGHT if i < n - 1 else "#FFF3E0"
        ec = ACCENT if i < n - 1 else "#B8860B"
        box(ax, x, y, w, h, s, fc=fc, ec=ec, fontsize=8.3)
        if i < n - 1:
            arrow(ax, (x + w, y + h / 2), (x + w + gap, y + h / 2), lw=1.6)

    # Decision outputs
    out_y = 1.3
    out_w = 3.0
    labels = [("ALLOW", GREEN, "Texte original transmis\nau LLM (via LiteLLM)"),
              ("MASK", "#B8860B", "Texte masque\n([EMAIL_1], etc.) transmis\nau LLM"),
              ("BLOCK", WARN, "Requete rejetee,\njamais envoyee au LLM\n(fail-closed)")]
    last_x = xs[-1] + w / 2
    total_out_w = 3 * out_w + 2 * 0.8
    ox = last_x - total_out_w / 2
    for label, color, desc in labels:
        box(ax, ox, out_y, out_w, 1.5, f"{label}\n{desc}", fc="white", ec=color, textcolor=color, fontsize=8.2)
        arrow(ax, (last_x, y), (ox + out_w / 2, out_y + 1.5), color=color, curve=0.0, lw=1.4)
        ox += out_w + 0.8

    ax.text(W / 2, 7.3, "Pipeline de traitement DLP (service dlp-service, FastAPI)", ha="center",
            fontsize=13.5, fontweight="bold", color=NAVY)
    ax.text(W / 2, 0.25, "Une seule correspondance de severite 'high' suffit a declencher BLOCK. Erreur d'extraction/analyse => fail-closed (BLOCK).",
            ha="center", fontsize=8.3, color=GREY, style="italic")
    return save(fig, "pipeline_dlp.png")


# ---------------------------------------------------------------------------
# 4. Sequence diagram: chat message send with DLP + streaming
# ---------------------------------------------------------------------------

def lifeline(ax, x, label, y_top, y_bot, color=NAVY):
    box(ax, x - 1.1, y_top, 2.2, 0.6, label, fc=color, ec=color, textcolor="white", fontsize=9)
    ax.plot([x, x], [y_top, y_bot], color="#B5B5B5", lw=1.2, linestyle="--", zorder=1)


def seq_arrow(ax, x1, x2, y, text, dashed=False, fontsize=7.8, color=GREY):
    style = "--" if dashed else "-"
    a = FancyArrowPatch((x1, y), (x2, y), arrowstyle="-|>", mutation_scale=12,
                         color=color, linewidth=1.3, linestyle=style, zorder=2)
    ax.add_patch(a)
    mx = (x1 + x2) / 2
    ax.text(mx, y + 0.13, text, ha="center", va="bottom", fontsize=fontsize, color="#222", zorder=3)


def build_sequence_chat():
    fig, ax = new_fig(18, 12.5)

    lanes = {
        "Frontend\n(React SPA)": 2.0,
        "Backend\n(ConversationController /\nConversationService)": 6.2,
        "Service DLP\n(FastAPI)": 10.4,
        "LiteLLM\nProxy": 14.0,
        "Fournisseur\nLLM": 17.0,
    }
    y_top = 11.2
    y_bot = 0.8
    for label, x in lanes.items():
        lifeline(ax, x, label, y_top, y_bot)

    fx, bx, dx, lx, px = lanes.values()
    y = 10.2
    step = 0.85

    seq_arrow(ax, fx, bx, y, "POST /conversations/{id}/messages/stream\n(JWT Bearer, SSE)"); y -= step - 0.15
    seq_arrow(ax, bx, dx, y, "POST /analyse-message (texte + pieces jointes)"); y -= step
    seq_arrow(ax, dx, bx, y, "AnalyseResponse{decision, masked_text, matches}", dashed=True); y -= step

    ax.text((bx + dx) / 2, y + 0.35, "alt decision", fontsize=8.5, color=GREY, style="italic", ha="center")
    y -= 0.25
    seq_arrow(ax, bx, lx, y, "[BLOCK] rien envoye — HTTP 422 / SSE event:error\ncode=DLP_BLOCKED", color=WARN); y -= step
    seq_arrow(ax, bx, lx, y, "[ALLOW/MASK] POST /v1/chat/completions\n(texte original ou masque, stream=true)", color=GREEN); y -= step
    seq_arrow(ax, lx, px, y, "Appel provider (cle API)"); y -= step
    seq_arrow(ax, px, lx, y, "Reponse en tokens", dashed=True); y -= step
    seq_arrow(ax, lx, bx, y, "Flux SSE data: {delta.content}", dashed=True); y -= step
    seq_arrow(ax, bx, fx, y, "event: token (par fragment)", dashed=True); y -= step
    seq_arrow(ax, bx, fx, y, "event: done (message persiste)", dashed=True); y -= step

    ax.text(9, 12.05, "Sequence — Envoi d'un message avec controle DLP et streaming", ha="center",
            fontsize=13.5, fontweight="bold", color=NAVY)
    return save(fig, "sequence_chat_dlp.png")


if __name__ == "__main__":
    build_global_architecture()
    build_erd()
    build_dlp_pipeline()
    build_sequence_chat()
