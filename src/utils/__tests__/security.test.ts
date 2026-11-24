import { describe, expect, it } from 'vitest';
import {
  escaparCelulaCsvSegura,
  escaparHtmlAnki,
  extrairTextoDeHtmlSeguro,
  parsearHtmlSeguroParaNos,
  parseJsonSeguro,
  sanitizarHtmlSeguro,
  sanitizarMensagemErroUi,
  sanitizarNomeArquivo,
  sanitizarUrlSegura,
  validarAssinaturaArquivo,
  validarCorCssSegura,
  validarForcaSenhaCadastro,
} from '../security';

describe('Suíte de Segurança — Sanitização HTML / XSS', () => {
  it('remove tags script, iframe, svg e atributos de evento mantendo formatação segura', () => {
    const malicioso =
      '<p onclick="alert(1)">Texto <b>importante</b></p><script>alert("xss")</script><img src=x onerror=alert(1)><svg onload=alert(1)><iframe src="javascript:alert(1)"></iframe>';
    const limpo = sanitizarHtmlSeguro(malicioso);
    expect(limpo).not.toContain('<script');
    expect(limpo).not.toContain('onerror');
    expect(limpo).not.toContain('onclick');
    expect(limpo).not.toContain('<img');
    expect(limpo).not.toContain('<svg');
    expect(limpo).not.toContain('<iframe');
    expect(limpo).toContain('<b>importante</b>');
    expect(limpo).toContain('Texto');
  });

  it('bloqueia XSS aninhado e links javascript: na árvore de nós segura', () => {
    const malicioso =
      '<scr<script>ipt>alert(1)</script><a href="javascript:alert(document.cookie)">clique</a><ul><li onmouseover="fetch(\'https://evil.test\')">item</li></ul>';
    const nos = parsearHtmlSeguroParaNos(malicioso);
    const texto = extrairTextoDeHtmlSeguro(malicioso);
    const limpo = sanitizarHtmlSeguro(malicioso);
    expect(limpo).not.toContain('javascript:');
    expect(limpo).not.toContain('onmouseover');
    expect(limpo).toContain('<ul><li>item</li></ul>');
    expect(nos.length).toBeGreaterThan(0);
    expect(texto).toContain('item');
  });
});

describe('Suíte de Segurança — Validação de URLs Externas', () => {
  it('aceita URLs HTTPS válidas e rejeita javascript:, data:, http: e credenciais embutidas', () => {
    expect(sanitizarUrlSegura('https://lh3.googleusercontent.com/a/avatar.png')).toBe(
      'https://lh3.googleusercontent.com/a/avatar.png'
    );
    expect(sanitizarUrlSegura('javascript:alert(1)')).toBeUndefined();
    expect(sanitizarUrlSegura('DATA:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(sanitizarUrlSegura('vbscript:msgbox(1)')).toBeUndefined();
    expect(sanitizarUrlSegura('http://insecure.example.com/pic.png')).toBeUndefined();
    expect(sanitizarUrlSegura('https://user:secret@example.com/pic.png')).toBeUndefined();
  });
});

describe('Suíte de Segurança — Prototype Pollution e Backup JSON', () => {
  it('remove chaves __proto__, constructor e prototype ao desserializar JSON', () => {
    const jsonMalicioso =
      '{"aplicacao":"lei-seca","__proto__":{"isAdmin":true},"constructor":{"prototype":{"polluted":true}},"codigos":[{"id":"c1","nome":"CF","prototype":{"x":1}}]}';
    const obj = parseJsonSeguro<Record<string, unknown>>(jsonMalicioso);
    expect(Object.prototype.hasOwnProperty.call(obj, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(obj, 'constructor')).toBe(false);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const codigos = obj.codigos as Array<Record<string, unknown>>;
    expect(Object.prototype.hasOwnProperty.call(codigos[0], 'prototype')).toBe(false);
  });

  it('rejeita JSON acima do limite máximo configurado', () => {
    expect(() => parseJsonSeguro('{"a":1}', 4)).toThrow(/limite máximo/i);
  });
});

describe('Suíte de Segurança — Validação de Uploads e Traversal', () => {
  it('valida magic bytes de PDF e DOCX e rejeita arquivos falsificados', () => {
    const pdfValido = new TextEncoder().encode('%PDF-1.7\n...').buffer;
    expect(() => validarAssinaturaArquivo(pdfValido, 'pdf')).not.toThrow();

    const pdfFalso = new TextEncoder().encode('<script>alert(1)</script>').buffer;
    expect(() => validarAssinaturaArquivo(pdfFalso, 'pdf')).toThrow(/assinatura PDF/i);

    const docxValido = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]).buffer;
    expect(() => validarAssinaturaArquivo(docxValido, 'docx')).not.toThrow();

    const docxFalso = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]).buffer; // PE/EXE header
    expect(() => validarAssinaturaArquivo(docxFalso, 'docx')).toThrow(/DOCX\/ZIP/i);

    const txtBinario = new Uint8Array([0x41, 0x42, 0x00, 0x43]).buffer;
    expect(() => validarAssinaturaArquivo(txtBinario, 'txt')).toThrow(/binário/i);
  });

  it('neutraliza path traversal e caracteres inválidos em nomes de arquivo', () => {
    expect(sanitizarNomeArquivo('../../etc/passwd')).toBe('passwd');
    expect(sanitizarNomeArquivo('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizarNomeArquivo('codigo\x00penal?.pdf')).toBe('codigopenal_.pdf');
  });
});

describe('Suíte de Segurança — Formula Injection, Cores CSS, Senhas e Erros', () => {
  it('neutraliza gatilhos de fórmula em CSV e escapa HTML no Anki', () => {
    expect(escaparCelulaCsvSegura("=CMD|'/C calc'!A0")).toBe('"\'=CMD|\'/C calc\'!A0"');
    expect(escaparCelulaCsvSegura('+1+1')).toBe('"\'+1+1"');
    expect(escaparCelulaCsvSegura('-2+3')).toBe('"\'-2+3"');
    expect(escaparCelulaCsvSegura('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
    expect(escaparHtmlAnki('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
  });

  it('valida estritamente cores CSS de marca-texto', () => {
    expect(validarCorCssSegura('#fef08a', '#000000')).toBe('#fef08a');
    expect(validarCorCssSegura('rgba(34, 197, 94, 0.25)', '#000000')).toBe(
      'rgba(34, 197, 94, 0.25)'
    );
    expect(validarCorCssSegura('red; background-image: url(javascript:alert(1))', '#000000')).toBe(
      '#000000'
    );
  });

  it('exige política de senha forte no cadastro', () => {
    expect(validarForcaSenhaCadastro('123456')).toMatch(/8 caracteres/i);
    expect(validarForcaSenhaCadastro('abcdefgh')).toMatch(/letra e um número/i);
    expect(validarForcaSenhaCadastro('12345678')).toMatch(/letra e um número/i);
    expect(validarForcaSenhaCadastro('Segura123')).toBeNull();
  });

  it('oculta metadados internos authInfo do Firestore na interface de erro', () => {
    const erroInterno = JSON.stringify({
      error: 'Missing or insufficient permissions',
      authInfo: { userId: 'uid_123', email: 'sigilo@exemplo.com' },
      operationType: 'get',
      path: 'users/uid_123',
    });
    const seguro = sanitizarMensagemErroUi(erroInterno);
    expect(seguro).not.toContain('uid_123');
    expect(seguro).not.toContain('sigilo@exemplo.com');
  });
});
