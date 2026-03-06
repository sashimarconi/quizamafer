# Deploy no GitHub + Vercel

## 1) Configurar variáveis na Vercel
No projeto da Vercel, adicione em **Settings > Environment Variables**:

- `PARADISE_API_KEY`
- `PARADISE_UPSELL_URL`
- `UTMIFY_API_TOKEN`

Com isso o backend já funciona no modo simplificado.

Variáveis avançadas (opcionais):
- `PARADISE_PRODUCTS_JSON` (recomendado para múltiplos produtos)
- `PARADISE_PRICE_TABLE_JSON` (recomendado para preço dinâmico: kit + bumps + frete)
- `UTMIFY_PLATFORM` (padrão: `QuizAmazon`)
- `UTMIFY_IS_TEST` (`true` para validar sem salvar pedidos)

Use os dados privados da Paradise no backend (não exponha no frontend).
O token da UTMify também deve ficar apenas no backend.

## UTMify (envio de pedidos)

- Endpoint local: `/api/utmify/order`
- Proxy para: `https://api.utmify.com.br/api-credentials/orders`
- Header enviado: `x-api-token: UTMIFY_API_TOKEN`

O frontend já redireciona chamadas legadas de `utmify-send-order` para `/api/utmify/order`, sem alterar o bundle minificado.

### Exemplo `PARADISE_PRODUCTS_JSON`

```json
{
	"default": { "productHash": "hash_padrao", "amountCents": 1000 },
	"freight": { "productHash": "hash_frete", "amountCents": 1990 },
	"bronze": { "productHash": "hash_bronze", "amountCents": 2990 },
	"prata": { "productHash": "hash_prata", "amountCents": 4990 },
	"ouro": { "productHash": "hash_ouro", "amountCents": 7990 }
}
```

O backend escolhe a chave por `productKey` ou `metadata.type` vindo da chamada.

### Exemplo `PARADISE_PRICE_TABLE_JSON`

```json
{
	"kits": { "bronze": 2000, "prata": 4000, "ouro": 6000 },
	"bumps": { "premium": 990, "dobro": 1990, "apple": 2990 },
	"freight": { "pac": 1390, "sedex": 1590, "express": 2590 }
}
```

Regra aplicada no backend:
- `type=kit`: valor = `kits[kitId] + soma(bumps selecionados)`
- `type=freight`: valor = `freight[shippingId ou shippingName]`
- só usa valor enviado pelo frontend como último fallback

### Fallback (produto único)

Se não quiser usar JSON, mantenha:

- `PARADISE_PRODUCT_HASH`
- `PARADISE_AMOUNT_CENTS`

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
- Abrir checkout e gerar PIX
- Confirmar retorno de QR Code / copia e cola
- Confirmar polling de status a cada 3s
- Após pagamento, confirmar retorno de `redirect_url` no backend

## Observação
Este workspace é um mirror estático sem código-fonte original (apenas bundle minificado). A migração foi feita com:
- API serverless em `/api/pix/*`
- Camada de compatibilidade no frontend para redirecionar chamadas antigas do gateway
