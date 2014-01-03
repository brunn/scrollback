create table message_labels(message varchar(63),label varchar(255),score double);
insert into message_labels(message , label ,score) select id,labels,1 from text_messages;
alter table text_messages drop labels;
