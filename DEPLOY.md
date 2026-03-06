# Deploy no GitHub + Vercel

## 1) Configurar variáveis na Vercel
No projeto da Vercel, adicione em **Settings > Environment Variables**:

- `BLACKCATPAY_SECRET_KEY`
- `BLACKCATPAY_API_KEY` (opcional, fallback)

Use a sua chave privada da BlackCatPay.

## 2) Publicar no GitHub
No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "feat: migrate pix gateway to blackcatpay via vercel api"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

## 3) Importar na Vercel
- Acesse https://vercel.com/new
- Importe o repositório
- Deploy

## 4) Teste do fluxo PIX
- Abrir checkout
- Gerar PIX de kit e frete
- Confirmar polling de status de pagamento

## Observação
Este workspace é um mirror estático sem código-fonte original (apenas bundle minificado). A migração foi feita com:
- API serverless em `/api/pix/*`
- Camada de compatibilidade no frontend para redirecionar chamadas antigas do gateway
