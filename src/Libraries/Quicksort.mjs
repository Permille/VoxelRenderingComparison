export default function Quicksort(Data, Start, End){
  const Stack = [Start, End];
  while(Stack.length > 0){
    const To = Stack.pop();
    const From = Stack.pop();
    if(To - From <= 0) continue;
    let i = From;
    let Pivot = To;
    while(i < Pivot){
      if(Data[i] > Data[Pivot]){
        const Temp = Data[i];
        Data[i] = Data[Pivot - 1];
        Data[Pivot - 1] = Data[Pivot];
        Data[Pivot] = Temp;
        Pivot--;
      } else i++;
    }
    Stack.push(From, Pivot - 1, Pivot + 1, To);
  }
};