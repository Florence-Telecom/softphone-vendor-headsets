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
exports.default = globalTeardown;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const PID_FILE = path_1.default.resolve(__dirname, '.e2e-server.pid');
function globalTeardown() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs_1.default.existsSync(PID_FILE))
            return;
        const pid = fs_1.default.readFileSync(PID_FILE, 'utf-8').trim();
        fs_1.default.unlinkSync(PID_FILE);
        try {
            // Kill the entire process tree
            (0, child_process_1.execSync)(`pkill -P ${pid}`, { stdio: 'ignore' });
            (0, child_process_1.execSync)(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
        catch ( /* already dead */_a) { /* already dead */ }
    });
}
//# sourceMappingURL=global-teardown.js.map