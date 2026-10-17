# Agenda Free 1.0.1

Site de agendamento para **um profissional e uma agenda**, com dashboard e banco persistente. Versão gratuita funcional, sem limite mensal artificial de reservas. Não é uma demonstração com dados fictícios.

## Começar no Windows

1. Instale Node.js 24, se ainda não tiver.
2. Baixe ou clone e extraia o projeto completo.
3. Dê dois cliques em **Iniciar Agenda.cmd**.
4. Aguarde o preparo e o navegador abrir.
5. Cadastre seu espaço, serviço e acesso administrativo.
6. No painel, confira expediente, contato, aviso de privacidade e publique seu serviço.

O primeiro serviço começa pausado. Seus dados ficam em .data/agenda.sqlite. Para encerrar o servidor local, use **Parar Agenda.cmd**. Não apague .data.

O iniciador local é para experimentar/usar no seu computador; não publica o site na internet.

## Alternativa por comandos

Na pasta do projeto:

    npm ci
    npm run setup
    npm run dev

Abra o link privado mostrado por setup. O endereço local é http://localhost:5173. O link de configuração expira em 30 minutos; execute setup novamente para emitir outro. Depois da primeira configuração, setup aponta para /entrar.

Não há senha padrão, usuário fictício ou serviço externo obrigatório para o modo local.

## Incluído

- Site responsivo com apresentação, serviços, preços informativos e contatos.
- Agendamento público sem criar conta.
- Duração real do serviço, expediente semanal, intervalos e bloqueios.
- Proteção transacional contra sobreposição e reenvio duplicado.
- Confirmação na tela, link privado e arquivo de calendário.
- Cancelamento pelo cliente dentro do prazo e pelo administrador.
- Dashboard diário, serviços, expediente, bloqueios, aparência e senha.
- Dados persistentes, sessão real e recuperação de acesso pelo operador.
- Exportação CSV do dia e backup SQLite.

Não inclui equipe, múltiplas unidades, cobrança online, e-mails/lembretes automáticos, sincronização com calendários ou assinatura do vendedor. Para reagendar, cancele e faça nova reserva.

## Publicar

Servidor Node com disco persistente pode usar SQLite. Hospedagem serverless precisa de PostgreSQL. Nunca use SQLite temporário em Vercel: não oferece persistência apropriada. Esta versão inclui adaptador PostgreSQL, mas a conexão com seu provedor precisa ser validada no seu ambiente.

Configure APP_URL com a origem final e, para PostgreSQL, DATABASE_URL privadamente. Execute npm run db:migrate antes de publicar. Não coloque credenciais em .env.example ou no Git.

Vercel Hobby é restrito a uso pessoal não comercial segundo seus termos atuais; não confunda código gratuito com hospedagem comercial gratuita. Veja o manual de publicação.

## Documentação externa

Use agenda-free-v1.0.1-documentacao.zip, começando por documentacao/00-leia-primeiro.md. O manual fica separado do projeto. O README permite o primeiro uso; os guias explicam operação, publicação, backup e arquitetura.

## Desenvolvimento

    npm run check
    npm run build
    npm run test:e2e

Os testes de navegador usam Edge instalado e portas 5195/5196. Todos os dados de teste ficam em work, fora do banco operacional.

Backend em src/modules/agenda; componentes em src/components; páginas/API em src/app. Node 24, Next 16.4.x, React 19.3.x, TypeScript 5.9.x. PostgreSQL usa pg; SQLite usa o módulo nativo de Node.

## Licença

MIT: permite estudar, modificar, utilizar comercialmente e redistribuir a base, preservando os avisos. Leia LICENSE. As condições de uma futura edição Pro serão tratadas separadamente para o código adicional. Os serviços externos têm seus próprios termos e custos.

## Formatação e Windows

Use npm run format para aplicar o padrão e npm run check para validar antes de enviar ao GitHub. Código e configuração usam LF por .gitattributes, inclusive em checkouts Windows; scripts nativos usam CRLF. Preserve .prettierrc.json, .prettierignore e .editorconfig no repositório e no pacote distribuído. Arquivos gerados pelo Next.js não são formatados manualmente.

Os atalhos .cmd abrem a interface pelo Windows PowerShell em modo STA, sem VBScript. O console permanece visível para diagnóstico e erros não encerram a janela imediatamente. Consulte o guia de instalação e segurança do manual separado.

### Cache Components

APIs compatíveis com Cache Components: GET aguarda uma requisição antes de acessar o backend. Verifique com `npm run test:cache-components` (pare o servidor antes). Consulte o manual separado `compatibilidade-cache-components.md` para atualizar uma instalação existente.

## Inclui e limites da entrega

| Inclui                                                   | Não inclui / depende da implantação                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Site, dashboard e reservas para um profissional          | Equipe, múltiplas unidades ou multiempresa                           |
| SQLite persistente e adaptador PostgreSQL                | Hospedagem, domínio e banco PostgreSQL contratado/configurado        |
| Autenticação administrativa e link privado do cliente    | Cobrança online e pagamento de serviços                              |
| Expediente, bloqueios, cancelamento, backup e exportação | Reagendamento direto, e-mails automáticos e sincronização externa    |
| Uso local sem serviço externo obrigatório                | Publicação automática na internet ou operação garantida em free tier |

## Instalação e confiança

A instalação gráfica e a alternativa por comandos estão descritas acima. Os atalhos .cmd dispensam VBScript e deixam o console visível para diagnóstico. Não execute como administrador nem desative proteções do Windows para instalar. Confira o arquivo baixado com o hash exibido pela plataforma para esse mesmo download. O manual separado contém instalacao-seguranca-e-integridade.md, apresentacao-do-produto.md e o checklist de aceite da interface.

## Por que não há installer/

Este produto é uma aplicação completa, executada na própria pasta. Não há cópia do módulo para outro aplicativo. scripts/ contém preparação do banco, inicialização/parada local, backup e manutenção. Os atalhos .cmd apenas iniciam essas ferramentas; src/ contém a aplicação.
