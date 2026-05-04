/** 日志输出 */

const raw_log = console.log;
const raw_error = console.error;

export default class CureLogger {
    private readonly cure_answer = "#C576FF";
    private readonly cure_mystique = "#FE6998";
    private readonly cure_eclair = "#40B9E1";
    private readonly cure_arcana_shadow = "#ea9a7e";
    private readonly base_style =
        "color:white; font-weight:bold; border-radius:3px; padding:2px 5px;";
    private readonly log_style = `background-color:${this.cure_answer};${this.base_style}`;
    private readonly warn_style = `background-color:${this.cure_mystique};${this.base_style}`;
    private readonly error_style = `background-color:${this.cure_eclair};${this.base_style}`;
    private readonly time_prefix_style = "color:#aaa";

    constructor(private prefix: string) {}

    private get_time_prefix() {
        return new Date().toLocaleString("zh-CN", {
            hour12: false,
        });
    }

    public log(title: string, ...args: any[]) {
        raw_log(
            `%c${this.get_time_prefix()} %c[${this.prefix}] - ${title}`,
            this.time_prefix_style,
            this.log_style,
            ...args,
        );
    }

    public warn(title: string, ...args: any[]) {
        raw_log(
            `%c${this.get_time_prefix()} %c[${this.prefix}] - ${title}`,
            this.time_prefix_style,
            this.warn_style,
            ...args,
        );
    }

    public error(title: string, ...args: any[]) {
        raw_error(
            `%c${this.get_time_prefix()} %c[${this.prefix}] - ${title}`,
            this.time_prefix_style,
            this.error_style,
            ...args,
        );
    }
}
