"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* istanbul ignore file */
const i18next_1 = __importDefault(require("i18next"));
const i18next_http_backend_1 = __importDefault(require("i18next-http-backend"));
const i18next_browser_languagedetector_1 = __importDefault(require("i18next-browser-languagedetector"));
const react_i18next_1 = require("react-i18next");
const backendOptions = {
    loadPath: `${process.env.PUBLIC_URL}i18n/{{lng}}.json`
};
i18next_1.default
    .use(i18next_http_backend_1.default)
    .use(i18next_browser_languagedetector_1.default)
    .use(react_i18next_1.initReactI18next)
    .init({
    backend: backendOptions,
    fallbackLng: 'en-us',
    debug: true,
    lowerCaseLng: true,
    interpolation: {
        escapeValue: false,
    }
});
exports.default = i18next_1.default;
//# sourceMappingURL=i18n.js.map