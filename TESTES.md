# Roteiro de testes — Oficina Lucrativa

Marque cada item depois de testar no navegador (Safari/Chrome) e, se possível, no celular.

## Armazenamento
- [ ] Salvar configurações + logo; fechar e abrir o navegador; dados continuam.
- [ ] Cadastrar cliente, equipamento (com fotos), OS, orçamento, componente, despesa, agendamento; fechar e abrir; tudo continua.
## Backup
- [ ] Exportar backup (JSON) e CSV de uma tabela.
- [ ] Apagar um cliente, restaurar o backup: cliente volta e o app baixa um backup de segurança antes.
- [ ] Importar um arquivo qualquer (.txt/.json inválido): mensagem de erro, dados intactos.
## Estoque e OS
- [ ] Entrada de 5 un.; OS usando 3 → saldo 2; editar OS para 1 → saldo 4; excluir OS → saldo 5.
- [ ] Tentar usar mais do que o saldo: o app bloqueia.
## Financeiro
- [ ] Receber pagamento parcial; saldo cai; tentar receber mais que o saldo: bloqueia.
## PDFs (precisa de js/vendor/jspdf.umd.min.js)
- [ ] Gerar os 5 documentos da OS e o orçamento: logo, dados da oficina, acentos e cores corretos.
## Offline
- [ ] Abrir o sistema, esperar carregar, desligar a internet, recarregar: tudo funciona (inclusive PDF).
## Instalação e tema
- [ ] Instalar como app; alternar tema claro/escuro; trocar cores nas configurações.
