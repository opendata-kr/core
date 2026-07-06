# @opendata-kr/core

data.go.kr OpenAPI를 위한 표준 전송계층. `<service>-mcp` 도구들이 공유한다.

```ts
import { createClient } from "@opendata-kr/core";

const client = createClient({
  path: "/1230000/ad/BidPublicInfoService",
  params: { type: "json" },
});
const { totalCount, items } = await client.call("getBidPblancListInfoCnstwk", {
  pageNo: 1, numOfRows: 10,
});
```

환경변수: `DATA_GO_KR_SERVICE_KEY`(필수), `DATA_GO_KR_BASE_URL`(선택, 기본 `https://apis.data.go.kr`).
