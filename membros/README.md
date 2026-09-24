# Relatório Geral de Membros

Front-end responsivo em HTML, CSS e JavaScript que lê diretamente o PDF:

`https://carlosmagnokill-svg.github.io/igreja/LISTA_GERAL_MEMBROS.pdf`

## Recursos

- Busca de nomes sem distinção de maiúsculas/minúsculas ou acentos.
- Filtros dinâmicos de Grupo, Categoria e Sexo.
- Tabela com It., Nome, Grupo, Categoria e Sexo.
- Cabeçalho de impressão com fonte, data, hora e grupo selecionado.
- Layout responsivo e impressão em A4 paisagem.
- Dados extraídos no navegador com PDF.js; não há cadastro hardcoded.

## Publicação no GitHub Pages

1. Envie `index.html`, `styles.css`, `app.js` e `logo_ICM_BRANCO.png` para a pasta publicada.
2. Mantenha o PDF disponível no endereço configurado em `PDF_URL`, no início de `app.js`.
3. Abra a página por HTTP/HTTPS. Módulos JavaScript não funcionam corretamente quando o HTML é aberto diretamente com `file://`.

Para testar localmente:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Observações de qualidade dos dados

O sistema usa as posições das colunas do PDF e possui uma rotina alternativa de leitura textual. Mudanças relevantes no layout do PDF podem exigir ajuste do parser. O número exibido em `It.` é sequencial sobre o resultado filtrado; o identificador original do PDF permanece na leitura interna.


## Salvar PDF

O botão **Salvar PDF** gera o arquivo no navegador com jsPDF e AutoTable, sem abrir a janela de impressão. Em celulares, o comportamento final do download depende do navegador e das permissões do sistema.

## Resumo e responsáveis

O PDF gerado inclui:
- responsável do grupo selecionado, obtido de `RESPONSAVEL_GA.xlsx`;
- resumo final por faixa/categoria;
- totais feminino e masculino.

Quando o filtro de grupo estiver em **Todos**, o cabeçalho informa “Todos os grupos”. Para exibir um responsável específico, selecione um grupo.

## Progresso de leitura

Durante a abertura do PDF, o sistema informa a página atual, o total de páginas e o percentual concluído, reduzindo a percepção de travamento em conexões mais lentas.


## Correção V6
Removida a paginação duplicada. O PDF agora exibe somente `Página X/Y` no rodapé.
