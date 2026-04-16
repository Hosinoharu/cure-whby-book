/** 日志输出 */

const raw_log = console.log;
const raw_error = console.error;

export default class CureLogger {
    private readonly cure_idol = "#FE5B9B";
    private readonly cure_wink = "#4060EE";
    private readonly cure_kyun = "#CD5FFB";
    private readonly base_style =
        "color:white; font-weight:bold; border-radius:3px; padding:2px 5px;";
    private readonly log_style = `background-color:${this.cure_idol};${this.base_style}`;
    private readonly warn_style = `background-color:${this.cure_wink};${this.base_style}`;
    private readonly error_style = `background-color:${this.cure_kyun};${this.base_style}`;

    constructor(private prefix: string) {}

    public log(title: string, ...args: any[]) {
        raw_log(`%c[${this.prefix}] - ${title}`, this.log_style, ...args);
    }

    public warn(title: string, ...args: any[]) {
        raw_log(`%c[${this.prefix}] - ${title}`, this.warn_style, ...args);
    }

    public error(title: string, ...args: any[]) {
        raw_error(`%c[${this.prefix}] - ${title}`, this.error_style, ...args);
    }
}
