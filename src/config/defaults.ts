import { PluginConfig } from '../types';

export const DEFAULT_CONFIG: PluginConfig = {
  strategy: 'priority',
  compression: 2,
  providers: {
    groq: { name: 'groq', category: 'chat', priority: 10, enabled: true },
    gemini: { name: 'gemini', category: 'chat', priority: 8, enabled: true },
    mistral: { name: 'mistral', category: 'chat', priority: 7, enabled: true },
    deepseek: { name: 'deepseek', category: 'chat', priority: 6, enabled: true },
    together: { name: 'together', category: 'code', priority: 5, enabled: true },
    huggingface: { name: 'huggingface', category: 'code', priority: 4, enabled: true },
    segmind: { name: 'segmind', category: 'image', priority: 3, enabled: true },
    cloudflare: { name: 'cloudflare', category: 'image', priority: 2, enabled: true }
  },
  emergency: 'local',
  watchdog: true
};