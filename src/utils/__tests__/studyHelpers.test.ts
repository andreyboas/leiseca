import { describe, expect, it } from 'vitest';
import {
  CORES_SUGESTAO_MARCADOR,
  derivarPaletaMarcador,
  MAX_CORES_PERSONALIZADAS,
  normalizarCorHex6,
} from '../studyHelpers';

describe('Marcadores personalizados', () => {
  it('define limite máximo de 5 marcadores personalizados', () => {
    expect(MAX_CORES_PERSONALIZADAS).toBe(5);
    expect(CORES_SUGESTAO_MARCADOR.length).toBeGreaterThanOrEqual(5);
  });

  it('normaliza códigos hex curtos e completos e aplica fallback em entradas inválidas', () => {
    expect(normalizarCorHex6('#abc')).toBe('#aabbcc');
    expect(normalizarCorHex6('  #A855F7 ')).toBe('#a855f7');
    expect(normalizarCorHex6('javascript:alert(1)', '#14b8a6')).toBe('#14b8a6');
    expect(normalizarCorHex6('rgb(1,2,3)', '#ef4444')).toBe('#ef4444');
  });

  it('deriva paleta legível para temas claro, sépia e escuro a partir de qualquer hex', () => {
    const paletaEscura = derivarPaletaMarcador('#1e293b');
    expect(paletaEscura.hexBorder).toBe('#1e293b');
    expect(paletaEscura.hexBg).toMatch(/^#[0-9a-f]{6}$/);
    expect(paletaEscura.hexBgDark).toBe('rgba(30, 41, 59, 0.32)');

    // Fundo claro derivado deve ter boa luminância para texto escuro
    const r = parseInt(paletaEscura.hexBg.slice(1, 3), 16);
    const g = parseInt(paletaEscura.hexBg.slice(3, 5), 16);
    const b = parseInt(paletaEscura.hexBg.slice(5, 7), 16);
    const luminanciaBg = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    expect(luminanciaBg).toBeGreaterThan(0.7);

    const paletaPastel = derivarPaletaMarcador('#fef08a');
    expect(paletaPastel.hexBorder).toBe('#fef08a');
    expect(paletaPastel.hexBg).toMatch(/^#[0-9a-f]{6}$/);
  });
});
