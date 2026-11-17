# Publicação

1. Coloque na pasta `js/vendor/`: `jspdf.umd.min.js` (obrigatório para PDFs) e, opcionalmente, `chart.umd.min.js` (gráficos; sem ele o painel usa barras simples).
   - https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
   - https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js
2. Edite `apresentacao.html` e troque `COLE_AQUI_O_LINK_DA_HOTMART` pelo link do produto.
3. Envie tudo para o GitHub Pages (mantendo as pastas `css/` e `js/`).
4. Após cada atualização, abra o site com Cmd+Shift+R. O número `oficina-vN` em `service-worker.js` deve subir a cada versão para o cache offline atualizar.
