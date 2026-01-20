package kr.elfaka.lostark.jsonprettier.dto;

public class JsonFormatResponseDto {
    private boolean ok;
    private String mode;
    private String formatted;
    private Stats stats;
    private ErrorBody error;

    public static class Stats {
        private int inputLength;
        private int outputLength;

        public Stats() {}
        public Stats(int inputLength, int outputLength) {
            this.inputLength = inputLength;
            this.outputLength = outputLength;
        }

        public int getInputLength() { return inputLength; }
        public void setInputLength(int inputLength) { this.inputLength = inputLength; }

        public int getOutputLength() { return outputLength; }
        public void setOutputLength(int outputLength) { this.outputLength = outputLength; }
    }

    public static class ErrorBody {
        private String code;
        private String message;
        private Integer line;
        private Integer column;

        public ErrorBody() {}
        public ErrorBody(String code, String message, Integer line, Integer column) {
            this.code = code;
            this.message = message;
            this.line = line;
            this.column = column;
        }

        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }

        public Integer getLine() { return line; }
        public void setLine(Integer line) { this.line = line; }

        public Integer getColumn() { return column; }
        public void setColumn(Integer column) { this.column = column; }
    }

    public static JsonFormatResponseDto success(String mode, String formatted, int inputLen, int outputLen) {
        JsonFormatResponseDto r = new JsonFormatResponseDto();
        r.ok = true;
        r.mode = mode;
        r.formatted = formatted;
        r.stats = new Stats(inputLen, outputLen);
        return r;
    }

    public static JsonFormatResponseDto fail(String code, String message, Integer line, Integer column) {
        JsonFormatResponseDto r = new JsonFormatResponseDto();
        r.ok = false;
        r.error = new ErrorBody(code, message, line, column);
        return r;
    }

    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public String getFormatted() { return formatted; }
    public void setFormatted(String formatted) { this.formatted = formatted; }

    public Stats getStats() { return stats; }
    public void setStats(Stats stats) { this.stats = stats; }

    public ErrorBody getError() { return error; }
    public void setError(ErrorBody error) { this.error = error; }
}
