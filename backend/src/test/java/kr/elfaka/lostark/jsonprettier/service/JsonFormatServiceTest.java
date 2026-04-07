package kr.elfaka.lostark.jsonprettier.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class JsonFormatServiceTest {

    private JsonFormatService service;

    @BeforeEach
    void setUp() {
        service = new JsonFormatService();
    }

    @Test
    void format_nullInput_returnsEmptyString() throws Exception {
        String result = service.format(null, "prettify", 2, false, false);
        assertThat(result).isEmpty();
    }

    @Test
    void format_emptyInput_returnsEmptyString() throws Exception {
        String result = service.format("", "prettify", 2, false, false);
        assertThat(result).isEmpty();
    }

    @Test
    void format_whitespaceOnlyInput_returnsEmptyString() throws Exception {
        String result = service.format("   ", "prettify", 2, false, false);
        assertThat(result).isEmpty();
    }

    @Test
    void format_prettify_2spaces_producesIndentedJson() throws Exception {
        String input = "{\"b\":1,\"a\":2}";
        String result = service.format(input, "prettify", 2, false, false);
        assertThat(result).contains("  \"b\"");
        assertThat(result).contains("  \"a\"");
    }

    @Test
    void format_prettify_4spaces_producesIndentedJson() throws Exception {
        String input = "{\"b\":1}";
        String result = service.format(input, "prettify", 4, false, false);
        assertThat(result).contains("    \"b\"");
    }

    @Test
    void format_minify_removesWhitespace() throws Exception {
        String input = "{\n  \"a\": 1,\n  \"b\": 2\n}";
        String result = service.format(input, "minify", 2, false, false);
        assertThat(result).isEqualTo("{\"a\":1,\"b\":2}");
    }

    @Test
    void format_sortKeys_outputsAlphabetically() throws Exception {
        String input = "{\"c\":3,\"a\":1,\"b\":2}";
        String result = service.format(input, "minify", 2, true, false);
        assertThat(result.indexOf("\"a\"")).isLessThan(result.indexOf("\"b\""));
        assertThat(result.indexOf("\"b\"")).isLessThan(result.indexOf("\"c\""));
    }

    @Test
    void format_ensureAscii_escapesNonAsciiCharacters() throws Exception {
        String input = "{\"key\":\"한글\"}";
        String result = service.format(input, "minify", 2, false, true);
        assertThat(result).doesNotContain("한글");
        assertThat(result).contains("\\u");
    }

    @Test
    void format_invalidJson_throwsException() {
        assertThatThrownBy(() -> service.format("{invalid}", "prettify", 2, false, false))
                .isInstanceOf(Exception.class);
    }

    @Test
    void format_nestedObject_sortKeys_sortedRecursively() throws Exception {
        String input = "{\"z\":1,\"nested\":{\"c\":3,\"a\":1}}";
        String result = service.format(input, "prettify", 2, true, false);
        assertThat(result.indexOf("\"nested\"")).isLessThan(result.indexOf("\"z\""));
        int nestedStart = result.indexOf("\"nested\"");
        String afterNested = result.substring(nestedStart);
        assertThat(afterNested.indexOf("\"a\"")).isLessThan(afterNested.indexOf("\"c\""));
    }

    @Test
    void format_arrayInput_preservesElements() throws Exception {
        String input = "[1,2,3]";
        String result = service.format(input, "minify", 2, false, false);
        assertThat(result).isEqualTo("[1,2,3]");
    }
}
