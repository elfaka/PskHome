package kr.elfaka.lostark.jsonprettier.service;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class JsonFormatService {

    private final ObjectMapper mapper = new ObjectMapper();

    public String format(String input, String mode, int indent, boolean sortKeys, boolean ensureAscii) throws Exception {
        if (input == null) input = "";
        String trimmed = input.trim();
        if (trimmed.isEmpty()) return "";

        JsonNode node = mapper.readTree(trimmed);

        if (sortKeys) {
            node = sortJsonKeys(node);
        }

        ObjectMapper local = mapper.copy();
        if (ensureAscii) {
            local.getFactory().configure(JsonGenerator.Feature.ESCAPE_NON_ASCII, true);
        }

        if ("minify".equalsIgnoreCase(mode)) {
            return local.writeValueAsString(node);
        }

        DefaultPrettyPrinter pp = createPrettyPrinter(indent);
        ObjectWriter writer = local.writer(pp);
        return writer.writeValueAsString(node);
    }

    private DefaultPrettyPrinter createPrettyPrinter(int indent) {
        int spaces = (indent == 4) ? 4 : 2;
        String indentStr = " ".repeat(spaces);

        DefaultPrettyPrinter pp = new DefaultPrettyPrinter();
        DefaultIndenter indenter = new DefaultIndenter(indentStr, DefaultIndenter.SYS_LF);
        pp.indentObjectsWith(indenter);
        pp.indentArraysWith(indenter);
        return pp;
    }

    private JsonNode sortJsonKeys(JsonNode node) {
        if (node == null) return null;

        if (node.isObject()) {
            ObjectNode obj = (ObjectNode) node;

            List<String> names = new ArrayList<>();
            Iterator<String> it = obj.fieldNames();
            while (it.hasNext()) names.add(it.next());
            Collections.sort(names);

            ObjectNode sorted = mapper.createObjectNode();
            for (String name : names) {
                sorted.set(name, sortJsonKeys(obj.get(name)));
            }
            return sorted;
        }

        if (node.isArray()) {
            ArrayNode arr = (ArrayNode) node;
            ArrayNode sortedArr = mapper.createArrayNode();
            for (JsonNode child : arr) {
                sortedArr.add(sortJsonKeys(child));
            }
            return sortedArr;
        }

        return node;
    }
}
