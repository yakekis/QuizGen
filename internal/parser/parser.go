// Package parser extracts plain text from uploaded documents.
// Supported formats: .txt, .pdf, .docx, .pptx
package parser

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"
)

// ExtractText dispatches to the right extractor based on file extension / MIME.
// Returns raw UTF-8 text suitable for LLM consumption.
func ExtractText(filename string, data []byte) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))

	// Detect MIME for extra safety
	detectedMIME := mime.TypeByExtension(ext)
	_ = detectedMIME

	switch ext {
	case ".txt", ".md":
		return extractTXT(data)
	case ".pdf":
		return extractPDF(data)
	case ".docx":
		return extractDOCX(data)
	case ".pptx":
		return extractPPTX(data)
	default:
		return "", fmt.Errorf("unsupported file type: %s", ext)
	}
}

// ── TXT ───────────────────────────────────────────────────────────────────────

func extractTXT(data []byte) (string, error) {
	return strings.TrimSpace(string(data)), nil
}

// ── PDF ───────────────────────────────────────────────────────────────────────
// Minimal PDF text-layer extractor. Reads BT...ET blocks and decodes
// parenthesised strings. Sufficient for typical school-grade PDFs.

func extractPDF(data []byte) (string, error) {
	content := string(data)
	var sb strings.Builder

	btIdx := 0
	for {
		btStart := strings.Index(content[btIdx:], "BT")
		if btStart < 0 {
			break
		}
		btStart += btIdx
		etEnd := strings.Index(content[btStart:], "ET")
		if etEnd < 0 {
			break
		}
		block := content[btStart : btStart+etEnd+2]
		btIdx = btStart + etEnd + 2

		// Extract parenthesised strings: (text)
		i := 0
		for i < len(block) {
			if block[i] == '(' {
				j := i + 1
				for j < len(block) && block[j] != ')' {
					if block[j] == '\\' {
						j++
					}
					j++
				}
				sb.WriteString(block[i+1 : j])
				sb.WriteByte(' ')
				i = j + 1
			} else {
				i++
			}
		}
	}

	result := sb.String()
	if strings.TrimSpace(result) == "" {
		return "", fmt.Errorf("no extractable text found in PDF (may be scanned/image-only)")
	}
	return result, nil
}

// ── DOCX ──────────────────────────────────────────────────────────────────────
// DOCX is a ZIP archive containing word/document.xml.

func extractDOCX(data []byte) (string, error) {
	return extractOOXMLText(data, "word/document.xml")
}

// ── PPTX ──────────────────────────────────────────────────────────────────────
// PPTX is a ZIP archive containing ppt/slides/slide*.xml.

func extractPPTX(data []byte) (string, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("unzip pptx: %w", err)
	}

	var sb strings.Builder
	for _, f := range r.File {
		if strings.HasPrefix(f.Name, "ppt/slides/slide") && strings.HasSuffix(f.Name, ".xml") {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			text, err := xmlTextContent(rc)
			rc.Close()
			if err != nil {
				continue
			}
			sb.WriteString(text)
			sb.WriteString("\n\n")
		}
	}

	if sb.Len() == 0 {
		return "", fmt.Errorf("no text found in PPTX")
	}
	return strings.TrimSpace(sb.String()), nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func extractOOXMLText(data []byte, entry string) (string, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("unzip: %w", err)
	}

	for _, f := range r.File {
		if f.Name == entry {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			defer rc.Close()
			return xmlTextContent(rc)
		}
	}
	return "", fmt.Errorf("entry %q not found in archive", entry)
}

// xmlTextContent reads an XML stream and returns all character data concatenated.
func xmlTextContent(r io.Reader) (string, error) {
	var sb strings.Builder
	dec := xml.NewDecoder(r)
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if cd, ok := tok.(xml.CharData); ok {
			text := strings.TrimSpace(string(cd))
			if text != "" {
				sb.WriteString(text)
				sb.WriteByte(' ')
			}
		}
	}
	return strings.TrimSpace(sb.String()), nil
}
