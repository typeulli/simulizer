# Compound interest

원금이 매년 같은 비율로 불어날 때 잔액이 어떻게 커지는지를 그래프
한 장으로 확인하는 것이 목표입니다.

## Steps

1. 새 파일을 만들고 다음 변수를 두세요:
   - 원금 `principal = 1000000` (예: 100만 원)
   - 연이자율 `rate = 0.05` (5%)
   - 기간 `years = 30`
2. 길이 `years + 1` 인 실수 배열 `balance` 를 만드세요.
3. 첫 잔액: `balance[0] = principal`.
4. `i` 가 `1` 부터 `years` 까지 도는 반복문 안에:
   - `balance[i] = balance[i-1] * (1 + rate)`
5. 반복 뒤에 **그래프로 보내기** 블록으로 `balance` 를 넘기세요.

## Pitfalls

- 매월 복리로 계산하고 싶다면 `rate` 를 12로 나누고 기간을 12배 하세요.
  반복 횟수는 `years * 12` 가 됩니다.
- 이 그래프는 인플레이션을 고려하지 않은 *명목값*입니다. *실질값*을
  보려면 매년 잔액을 인플레이션율로 한 번 더 나누세요.

## Variations

- **저축 + 복리** — 매년 일정액을 추가로 더하는 모델.
  `balance[i] = balance[i-1] * (1 + rate) + yearly_deposit`.
- **이자율 변동** — `rate` 를 배열로 만들어 매년 다르게 적용.
- *원금만 유지*했을 때(`balance[i] = principal`)의 곡선을 같은 그래프에
  함께 그리면 복리의 효과를 한눈에 비교할 수 있습니다.

## Accuracy

수식은 정확하지만 *현실의 자산*은 이렇게 매끈하지 않습니다. 변동성을
넣고 싶다면 [임의보행](/docs/make/random-walk) 페이지를 보세요.

```simulizer
compound-interest
```
