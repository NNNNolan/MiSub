export const DEFAULT_LATENCY_TEST_URL = 'https://www.gstatic.com/generate_204';
const HTTP_LATENCY_TEST_URL = DEFAULT_LATENCY_TEST_URL.replace('https:', 'http:');

export function upgradeLatencyTestUrls(templateText) {
    return templateText.replace(/\bhttps?:\/\/[^\s`"',)\]}]+/g, (url) => {
        const [endpoint] = url.split(/[?#]/, 1);
        return endpoint === HTTP_LATENCY_TEST_URL
            ? DEFAULT_LATENCY_TEST_URL + url.slice(endpoint.length)
            : url;
    });
}
