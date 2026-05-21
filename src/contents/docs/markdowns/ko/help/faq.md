# FAQ

## Is Simulizer free?

네. 가입과 사용 모두 무료입니다. 결제 모듈은 존재하지 않습니다.

## Which browsers are supported?

WebAssembly와 ES 모듈을 지원하는 최신 브라우저면 됩니다. Chrome,
Edge, Safari, Firefox 최신 버전 모두 사용할 수 있습니다. GPU
가속(WebGPU)은 Chrome 계열에서 가장 잘 지원됩니다.

## Do I need internet?

처음 페이지를 열 때, 그리고 AI 어시스턴트·수식 OCR·번역·네이티브
빌드처럼 *외부 서비스*를 호출하는 기능을 쓸 때는 인터넷이 필요합니다.
일반적인 블록 작성과 실행은 페이지를 한 번 열어 두면 오프라인에서도
할 수 있습니다.

## Where does my data go?

블록 작업 본문은 본인 계정에 연결되어 *Simulizer 서버*에 저장됩니다.
시뮬레이션 *실행 자체*는 브라우저 안에서 이루어지므로 *결과 데이터*는
서버로 전송되지 않습니다. 단, 다음은 예외입니다.

- 이미지 OCR을 쓰면 *이미지*가 OCR 서버로 전송됩니다.
- AI 어시스턴트를 쓰면 *현재 블록 구조*와 *프롬프트*가 AI 서버로 전송됩니다.
- 네이티브 빌드를 누르면 *변환된 코드*가 컴파일 서버로 전송됩니다.

## Can I share my work?

네. 공유 링크 모드를 켜면 *URL을 가진 누구나* 읽기 전용으로 열 수
있습니다. [공유와 복제](/docs/tools/share-and-duplicate).

## My result looks wrong. Is it a bug?

대부분은 *모델 자체* 또는 *수치 안정성*의 문제입니다. Simulizer는
사용자가 짠 그대로 정확히 실행할 뿐입니다.
[수치 안정성 책임](/docs/concepts/verification) 페이지의 검증
체크리스트를 먼저 확인해 보세요.

## Can I trust AI output?

아니요. *항상 검토 후 적용*하고, 적용 후에도 결과의 정확성은 직접
검증하세요. [AI가 할 수 있는 것, 못 하는 것](/docs/concepts/ai-boundary).

## Where else can I get help?

- 증상별 해결책 — [자주 막히는 곳](/docs/help/troubleshooting)
