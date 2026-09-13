import { PluginConfig } from '../types';
import { Config } from '../config/Config';
import { Presets, Preset, PresetError } from '../config/Presets';

export class PresetsCommand {
  private presets: Presets;
  private config: Config;

  constructor(presets: Presets, config: Config) {
    this.presets = presets;
    this.config = config;
  }

  /**
   * Handle `/use preset ...` subcommands.
   * Returns the display string for the dispatched slot.
   */
  handle(args: string[]): string {
    const slot = (args[0] as string | undefined)?.trim() ?? '';
    if (!slot || slot === 'list') return this.list();
    if (slot === 'save') return this.save(args[1] as string | undefined);
    if (slot === 'load') return this.loadDirect(args[1] as string | undefined);
    if (slot === 'delete') return this.deletePreset(args[1] as string | undefined);
    if (slot === 'show') return this.show(args[1] as string | undefined);
    // Direct form: `/use preset freeflow` or `/use preset minimal` (and any existing saved preset)
    return this.loadDirect(slot);
  }

  private list(): string {
    const names = this.presets.listAll();
    const lines: string[] = ['Presets:'];
    for (const name of names) {
      try {
        const preset = this.presets.get(name);
        const builtin = this.isBuiltin(name);
        const tag = builtin ? '(built-in)' : '';
        const extra = preset.prediction ? ', prediction' : '';
        lines.push(`  ${name}${tag ? ' ' + tag : ''}  strategy=${preset.strategy} compression=${preset.compression}${extra}`);
      } catch {
        lines.push(`  ${name}`);
      }
    }
    lines.push('');
    lines.push('Usage: /use preset save <name>  load <name>  show <name>  delete <name>  |  /use preset freeflow  /use preset minimal');
    return lines.join('\n');
  }

  private show(name?: string): string {
    if (!name) {
      throw new PresetError('Usage: /use preset show <name>');
    }
    const preset = this.presets.get(name);
    const lines = [
      `Preset: ${preset.name}`,
      `  strategy:    ${preset.strategy}`,
      `  compression: ${preset.compression}`,
      `  prediction:  ${String(preset.prediction)}`
    ];
    if (preset.repoScope) {
      lines.push(`  repoScope:   ${JSON.stringify(preset.repoScope)}`);
    }
    return lines.join('\n');
  }

  private save(name?: string): string {
    if (!name) {
      throw new PresetError('Usage: /use preset save <name> — saves current config as a named preset');
    }
    if (name === 'freeflow' || name === 'minimal') {
      throw new PresetError('Cannot overwrite builtin preset: ' + name);
    }
    const current = this.config.load();
    const preset: Omit<Preset, 'name'> & { name?: string } = {
      strategy: current.strategy,
      compression: current.compression
    };
    if (typeof (current as PluginConfig).prediction === 'boolean') {
      (preset as Preset).prediction = (current as PluginConfig).prediction;
    }
    this.presets.save(name, preset);
    return `Saved preset "${name}" from current config (strategy=${current.strategy}, compression=${current.compression})`;
  }

  /** Direct load path: `/use preset <name>` or `/use preset load <name>`. */
  private loadDirect(name?: string): string {
    if (!name) {
      throw new PresetError('Usage: /use preset <name>  or  /use preset load <name>');
    }
    const preset = this.presets.get(name);
    const current = this.config.load();
    const next: PluginConfig = this.presets.applyPreset(current, preset);
    if (preset.prediction !== undefined) {
      next.prediction = preset.prediction;
    }
    this.config.save(next);
    return `Applied preset "${preset.name}" — strategy=${preset.strategy}, compression=${preset.compression}${preset.prediction ? ', prediction' : ''}`;
  }

  /** Delete a user preset. */
  private deletePreset(name?: string): string {
    if (!name) {
      throw new PresetError('Usage: /use preset delete <name>');
    }
    this.presets.delete(name);
    return `Deleted preset "${name}"`;
  }

  private isBuiltin(name: string): boolean {
    return name === 'freeflow' || name === 'minimal';
  }
}
