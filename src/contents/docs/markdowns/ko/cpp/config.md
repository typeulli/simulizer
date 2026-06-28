# Project config (config.json)

C++ 워크스페이스는 프로젝트별 설정을 프로젝트 루트의 `config.json`
파일 하나로 관리합니다. 이 파일은 *선택 사항*이라, 없으면 모든 항목이
기본값으로 동작합니다. 설정은 빌드 서버가 *원본(source of truth)*으로
직접 읽습니다.

## 여는 방법

설정을 바꾸는 방법은 두 가지입니다.

- **설정 창** — 에디터 오른쪽 위의 톱니바퀴(⚙) 버튼을 누르거나, 명령
  팔레트(`F1` 또는 `Ctrl/Cmd+Shift+P`)에서 **Open Settings**를 실행하세요.
  VS Code 스타일의 폼으로 각 항목을 체크박스/드롭다운으로 바꿉니다.
- **JSON 직접 편집** — 명령 팔레트에서 **Open Settings (JSON)**를 실행하면
  `config.json`이 에디터 탭으로 열립니다(없으면 만들어 줍니다). 입력 중
  자동완성과 검증이 동작합니다.

> 기본값과 같은 항목은 파일에 *기록되지 않습니다*. 그래서 아무것도 바꾸지
> 않은 프로젝트의 `config.json`은 빈 객체 `{}`입니다. JSON 형식이 깨지면
> 기본 설정으로 되돌려 빌드/실행하며, 에디터가 형식 오류를 따로 알려 줍니다.

## 구조

설정은 세 개의 최상위 섹션으로 나뉩니다.

```json
{
  "build":       { /* 빌드 전용: 대상 OS + exe 아이콘 */ },
  "compile":     { /* 빌드·실행 모두에 적용: 최적화 / 표준 / 정의 */ },
  "environment": { /* 실행 전용: TensorFlow.js 백엔드 */ }
}
```

### build — 빌드 전용

실행 파일을 만드는 **Build**에만 적용되고, 브라우저에서 돌리는 **Run**은
무시합니다.

| 키 | 의미 | 기본값 |
| --- | --- | --- |
| `system` | 빌드 대상 OS별 on/off (`windows`/`linux`/`macos`). 켜진 OS마다 네이티브 바이너리를 만들어 하나의 `.sim`으로 묶고, 실행 시 현재 OS용만 풀어 씁니다. | 세 OS 모두 `true` |
| `icon` | Windows exe 아이콘으로 쓸 이미지의 상대 경로. `.ico`는 그대로, 다른 형식(PNG/JPG 등)은 서버에서 `.ico`로 변환됩니다. **Windows 빌드에서만** 적용됩니다. | `""` (기본 아이콘) |

```json
{
  "build": {
    "system": { "linux": false },
    "icon": "build/icon/app.png"
  }
}
```

위 예시는 Linux 바이너리를 빼고(Windows·macOS만 빌드), `build/icon/app.png`를
Windows exe 아이콘으로 씁니다. `system`은 *끈* OS만 적으면 됩니다 — 적지
않은 OS는 자동으로 켜져 있습니다. 아이콘 이미지는 프로젝트 어디에 두어도
되며, 설정 창의 "이미지 업로드" 버튼은 `build/icon` 폴더에 넣어 줍니다.

### compile — 빌드·실행 공통

**Build**와 **Run** 양쪽 컴파일에 모두 적용됩니다.

| 키 | 값 | 기본값 |
| --- | --- | --- |
| `optimization` | `O0` / `O1` / `O2` / `O3` / `Os` (컴파일러 `-O…`) | `O3` |
| `std` | `c++17` / `c++20` / `c++23` (`-std=…`) | `c++17` |
| `defines` | 전처리기 정의 배열 (`-D`). 예: `["DEBUG", "VERSION=2"]` | `[]` |

```json
{
  "compile": {
    "optimization": "O2",
    "std": "c++20",
    "defines": ["DEBUG", "MAX_ITERS=1000"]
  }
}
```

`defines`의 각 항목은 `이름` 또는 `이름=값` 형태만 허용되며(값은 영문·숫자·
`_`·`.`), 그 외 문자는 명령줄에 직접 닿기 때문에 안전을 위해 거부됩니다.
`c++23`은 툴체인에 따라 일부만 지원될 수 있습니다.

### environment — 실행 전용

브라우저에서 돌리는 **Run**에만 적용됩니다.

| 키 | 값 | 기본값 |
| --- | --- | --- |
| `device` | TensorFlow.js 실행 백엔드: `webgpu` / `webgl` / `cpu` | `webgpu` |

```json
{
  "environment": { "device": "webgl" }
}
```

기본값 `webgpu`는 워커의 자동 선택 순서(WebGPU → WebGL → CPU)와 같아서,
굳이 지정하지 않으면 파일에 기록되지 않습니다. 특정 기기에서 백엔드를
고정하고 싶을 때만 적어 주세요.

## 관련 문서

- [AI agent](/docs/cpp/agent) — 워크스페이스 안에서 AI에게 코드 수정을 맡기기
- [Native build](/docs/advanced/native-build) — 블록 프로젝트를 실행 파일로 빌드하기
