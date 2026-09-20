// Original, redistributable practice exercises for the static GitHub Pages edition.
// They are not official IELTS questions or a substitute for a full-length test.
export const publicIelts = {
  reading: [
    {
      id:'public-reading-gardens', title:'Rooftop gardens', question_type:'short_answer',
      passage:'A university converted the roof of its science building into a garden in 2022. The garden holds rainwater in shallow soil beds, slowing runoff during storms. Students record soil moisture every morning and compare it with rainfall measured on the ground. The team first planted tomatoes, but strong winds damaged them. Hardy herbs now occupy the most exposed beds. The garden is open to visitors on Friday afternoons, although research plots remain closed.',
      questions:[
        {text:'In what year was the rooftop garden created?',answer:'2022',explanation:'The first sentence gives the year.'},
        {text:'What does the garden slow during storms?',answer:'runoff',explanation:'The soil beds slow rainwater runoff.'},
        {text:'What do students record every morning?',answer:'soil moisture',explanation:'Students measure soil moisture each morning.'},
        {text:'Which crop was damaged by strong winds?',answer:'tomatoes',explanation:'The original tomato plants were damaged.'},
        {text:'On which day can visitors enter the garden?',answer:'Friday',explanation:'Public visits are on Friday afternoons.'}
      ]
    },
    {
      id:'public-reading-library', title:'The mobile library', question_type:'true_false_not_given',
      passage:'A mobile library visits six villages each week. Its route was changed last spring after residents asked for a longer stop near the market. Borrowers may return books at any stop, even if they collected them elsewhere. The van also offers free internet access, but it has no printing service. Staff plan to survey visitors next winter before changing the route again.',
      questions:[
        {text:'The library visits six villages each week.',options:['TRUE','FALSE','NOT GIVEN'],answer:'TRUE',explanation:'The first sentence states this directly.'},
        {text:'Books must be returned at the stop where they were borrowed.',options:['TRUE','FALSE','NOT GIVEN'],answer:'FALSE',explanation:'Books may be returned at any stop.'},
        {text:'The van provides a printing service.',options:['TRUE','FALSE','NOT GIVEN'],answer:'FALSE',explanation:'It has no printing service.'},
        {text:'The market is the busiest stop on the route.',options:['TRUE','FALSE','NOT GIVEN'],answer:'NOT GIVEN',explanation:'The passage does not compare stop usage.'},
        {text:'Staff intend to survey visitors next winter.',options:['TRUE','FALSE','NOT GIVEN'],answer:'TRUE',explanation:'A survey is planned for next winter.'}
      ]
    }
  ],
  listening: [
    {
      id:'public-listening-workshop', title:'Community workshop booking', question_type:'short_answer',
      transcript:'Hello, this is the community workshop. Your bicycle repair class is booked for Thursday at ten thirty in the morning. Please bring your bicycle and a notebook. We will provide the tools. The class is in Room Four, beside the main entrance. If you need to cancel, call us by Tuesday evening.',
      questions:[
        {text:'On which day is the class?',answer:'Thursday',explanation:'The booking is for Thursday.'},
        {text:'At what time does the class begin? (Write a time such as 10:30)',answer:'10:30',explanation:'The class begins at ten thirty.'},
        {text:'What should participants bring besides a bicycle?',answer:'a notebook',explanation:'The speaker asks participants to bring a notebook.'},
        {text:'In which room is the class?',answer:'Room Four',explanation:'The class is in Room Four.'},
        {text:'By which day should a cancellation be made?',answer:'Tuesday',explanation:'Cancellations should be made by Tuesday evening.'}
      ]
    }
  ],
  writing1: [
    {id:'public-writing-1',title:'Writing Task 1 · Library visits',prompt:'The table below shows visits to a community library in three months. January: 1,200; February: 1,450; March: 1,700. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',model_answer:'Library visits rose steadily over the three months shown. The library recorded 1,200 visits in January, 1,450 in February and 1,700 in March. This was an increase of 250 visits in each successive month. Overall, March had 500 more visits than January, approximately 42% above the January figure. The table therefore shows consistent growth rather than a sudden change or a decline. It does not provide information about the reasons for the increase or the number of individual visitors.'}
  ],
  writing2: [
    {id:'public-writing-2',title:'Writing Task 2 · Public transport',prompt:'Some people think cities should spend more on public transport, while others believe improving roads is more important. Discuss both views and give your own opinion. Write at least 250 words.',model_answer:'Both public transport and roads affect how easily people can travel through a city. Better roads can reduce delays at dangerous junctions and help buses as well as private vehicles. This may be especially useful in places where existing roads are poorly maintained. However, expanding roads alone can encourage more driving, leaving congestion largely unchanged over time. Reliable buses and trains can move many people using less space, and they provide an option for residents who do not own a car. In my view, cities should maintain safe roads but prioritise public transport where population density makes frequent services practical. The best balance depends on local travel patterns and costs, not on a single rule for every city.'}
  ]
};
