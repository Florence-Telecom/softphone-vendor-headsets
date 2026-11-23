var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
const PID_FILE = path.resolve(__dirname, '.e2e-server.pid');
export default function globalTeardown() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs.existsSync(PID_FILE))
            return;
        const pid = fs.readFileSync(PID_FILE, 'utf-8').trim();
        fs.unlinkSync(PID_FILE);
        try {
            // Kill the entire process tree
            execSync(`pkill -P ${pid}`, { stdio: 'ignore' });
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
        catch ( /* already dead */_a) { /* already dead */ }
    });
}
//# sourceMappingURL=global-teardown.js.map