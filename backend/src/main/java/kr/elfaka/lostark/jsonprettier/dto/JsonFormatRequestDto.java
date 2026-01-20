package kr.elfaka.lostark.jsonprettier.dto;

public class JsonFormatRequestDto {
    private String input;
    private String mode;         // "prettify" | "minify"
    private Integer indent;      // 2 | 4 (default 2)
    private Boolean sortKeys;    // default false
    private Boolean ensureAscii; // default false

    public String getInput() { return input; }
    public void setInput(String input) { this.input = input; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public Integer getIndent() { return indent; }
    public void setIndent(Integer indent) { this.indent = indent; }

    public Boolean getSortKeys() { return sortKeys; }
    public void setSortKeys(Boolean sortKeys) { this.sortKeys = sortKeys; }

    public Boolean getEnsureAscii() { return ensureAscii; }
    public void setEnsureAscii(Boolean ensureAscii) { this.ensureAscii = ensureAscii; }
}
