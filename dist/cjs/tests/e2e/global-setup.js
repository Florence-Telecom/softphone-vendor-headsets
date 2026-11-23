"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalSetup;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
let appProcess;
const PID_FILE = path_1.default.resolve(__dirname, '.e2e-server.pid');
function checkServer(url) {
    return new Promise((resolve) => {
        const req = https_1.default.get(url, { rejectUnauthorized: false }, (res) => {
            resolve(res.statusCode !== undefined);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
}
function waitForServer(url_1) {
    return __awaiter(this, arguments, void 0, function* (url, timeoutMs = 60000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (yield checkServer(url))
                return;
            yield new Promise(r => setTimeout(r, 2000));
        }
        throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
    });
}
function globalSetup() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const reactAppDir = path_1.default.resolve(__dirname, '../../');
        appProcess = (0, child_process_1.exec)('yarn start', {
            cwd: reactAppDir,
            env: Object.assign(Object.assign({}, process.env), { BROWSER: 'none', HTTPS: 'true' })
        });
        // Write PID to file so teardown can kill it
        fs_1.default.writeFileSync(PID_FILE, String(appProcess.pid));
        (_a = appProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (d) => process.stdout.write(d));
        (_b = appProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (d) => process.stderr.write(d));
        yield waitForServer('https://localhost:8443');
    });
}
//# sourceMappingURL=global-setup.js.map